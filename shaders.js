let fragment_shader = `
precision highp float;
uniform vec2 resolution;
uniform vec3 cameraPos;
uniform vec3 cameraDir;
uniform float surface_level;
uniform mat4 weights_W[2];
uniform vec4 weights_V[2];

const float EPS = 0.01;
const vec3 lightDir = vec3(0, 1, 0);
const float blind_radius = 5.;

vec4 tanh(vec4 x){
	vec4 exp_2 = exp(2.0 * x);
	return (exp_2 - 1.0) / (exp_2 + 1.0);
}

float evaluate_nn( vec3 p ) {
	float result = 0.;
	vec4 ext_position = vec4(p, 1);
	for (int i = 0; i < 2; i++ ) {
		vec4 res1 = ext_position * weights_W[i];
		result += dot(tanh(res1), weights_V[i]);
	}
	return result;
}

vec4 sceneColor( vec3 p ) {
	return vec4((p + sign(sin(length(p) * 10.))) * 0.1 + 0.5, 1.);
}

vec3 getNormal( vec3 p ) {
	return normalize(vec3(
		evaluate_nn(p + vec3( EPS, 0.0, 0.0 ) ) - evaluate_nn(p + vec3( -EPS, 0.0, 0.0 ) ),
		evaluate_nn(p + vec3( 0.0, EPS, 0.0 ) ) - evaluate_nn(p + vec3( 0.0, -EPS, 0.0 ) ),
		evaluate_nn(p + vec3( 0.0, 0.0, EPS ) ) - evaluate_nn(p + vec3( 0.0, 0.0, -EPS ) )
	));
}

vec3 getRayColor( vec3 origin, vec3 ray) {
	// moving right to the target sphere
	// origin + alpha * ray has norm of blind_radius
	// length(origin)^2 + 2 * alpha dot(origin, ray) + alpha^2 * 1 = blind_radius^2
	float b = dot(origin, ray);
	float c = dot(origin, origin) - blind_radius * blind_radius; 
	float alpha = - b + sign(b) * sqrt(b * b - c);
	origin = origin + alpha * ray;
	const int loop_length = 64;
	float step = 2. * sqrt(b * b - c) / float(loop_length);

	// preparing for the loop
	vec3 p = origin;
	float original_floor = floor(evaluate_nn( p ) - surface_level);
	bool intersected = false;
	int j = 1;

	for (int i = 1; i < 64; i++ ) {
		p += step * ray;
		float current_floor = floor(evaluate_nn( p ) - surface_level);
		if (current_floor != original_floor){
			intersected = true;
			j = i;
			break;
		} 
	}


	// float newDepth;
	// float newValue;
	// float value;

	if ( !intersected ) discard;

	// making it precise with hord-like method
	float lDepth = step * float(j - 1);
	float rDepth = step * float(j);

	float lValue = evaluate_nn( origin + lDepth * ray ) - surface_level;
	float rValue = evaluate_nn( origin + rDepth * ray ) - surface_level;

	float target_value = floor(max(lValue, rValue));
	for( int i=0; i < 10; i++) {
		float newDepth = lDepth - (lDepth - rDepth) / (lValue - rValue) * (lValue - target_value);
		p = origin + newDepth * ray;
		float newValue = evaluate_nn( p ) - surface_level;
		if((newValue - target_value) * (rValue - target_value) < 0.){
			lValue = newValue;
			lDepth = newDepth;
		} else {
			rValue = newValue;
			rDepth = newDepth;
		}
	}

	// hit check and calc color
	vec3 normal = getNormal(p);
	if(dot(normal, ray) > 0.){
		normal = - normal;
	}
	float diffuse = clamp( dot( lightDir, normal ), 0.3, 1.0 );
	float specular = pow( clamp( dot( reflect( lightDir, normal ), ray ), 0.0, 1.0 ), 10.0 ) + 0.2;
	vec3 color = ( sceneColor( p ).rgb * diffuse + vec3( 0.7 ) * specular ) ;
	return color; 
}

void main(void) {
	// fragment position
	vec2 p = ( gl_FragCoord.xy * 2.0 - resolution ) / min( resolution.x, resolution.y ) / 2.;
	// camera and ray
	vec3 cPos  = cameraPos;
	vec3 cDir  = cameraDir;
	vec3 cSide = normalize( cross( cDir, vec3( 0.0, 1.0 ,0.0 ) ) );
	vec3 cUp   = normalize( cross( cSide, cDir ) );

	float targetDepth = 1.0;
	vec3 ray = normalize( cSide * p.x + cUp * p.y + normalize(cDir) * targetDepth );

	// dummy check for out of region. Ray is normalized
	float shortest_distance = length(cPos - ray * dot(ray, cPos));
	if (shortest_distance > blind_radius) {
		discard;
	}
	
	vec3 color = getRayColor( cPos, ray);

	gl_FragColor = vec4(color, 0.6);
	// webGL doesn't fully support gl_FragDepth. ARGH!
}
`;

let raymarch_vertex_shader = `
attribute vec3 position;
void main(void) {
	gl_Position = vec4(position, 1.0);
}
`;

let lines_vertex_shader = `
// attribute vec3 position;
varying float value;
varying vec3 p;
varying vec4 screen_position;

uniform mat4 weights_W[2];
uniform vec4 weights_V[2];

const float EPS = 0.01;
const float OFFSET = EPS * 10.0;
const vec3 lightDir = vec3(0, 1, 0);

vec4 tanh(vec4 x){
	vec4 exp_2 = exp(2.0 * x);
	return ((exp_2 - 1.0)/(exp_2 + 1.0));
}

float evaluate_nn( vec3 p ) {
	float result = 0.;
	vec4 ext_position = vec4(p, 1);
	for (int i = 0; i < 2; i++ ) {
		vec4 res1 = ext_position * weights_W[i];
		result += dot(tanh(res1), weights_V[i]);
	}
	return result;
}

vec3 getGradient( vec3 p ) {
	return vec3(
		evaluate_nn(p + vec3( EPS, 0.0, 0.0 ) ) - evaluate_nn(p + vec3( -EPS, 0.0, 0.0 ) ),
		evaluate_nn(p + vec3( 0.0, EPS, 0.0 ) ) - evaluate_nn(p + vec3( 0.0, -EPS, 0.0 ) ),
		evaluate_nn(p + vec3( 0.0, 0.0, EPS ) ) - evaluate_nn(p + vec3( 0.0, 0.0, -EPS ) )
	);
}

void main(void) {
	float index = floor(position[0] / 100.);
	float step = (index - 4.) * 0.02;
	p = vec3(mod(position[0], 100.) - 10., position[1], position[2]);
	for (int i=0; i < 20; i++) {
		p += normalize(getGradient(p)) * step;
	}
	value = evaluate_nn(p);
	gl_Position = projectionMatrix * modelViewMatrix * vec4( p , 1.0 );
	screen_position = gl_Position;
} 
`;

let lines_fragment_shader = `
uniform vec3 color;
uniform float surface_level;
varying float value;
varying vec3 p;
varying vec4 screen_position;

void main() {
	if (length(p) > 5.) {
		discard;
	}
	float time_delta = fract(surface_level - value); 
	
	gl_FragColor = vec4(0.5 + value / 10., 0.25 - value / 10., 0.5 - value / 4.,  exp(-7. * time_delta) * 0.4 );
	return;
}
`;