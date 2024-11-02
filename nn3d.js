let position_camera, dummy_camera, dummy_scene, controls, renderer;
let dummy_geometry, dummy_material, dummy_mesh, lines_geometry, lines_material;
let animation_loop = 5; // seconds

let capturer = null;

let mouse = new THREE.Vector2( 0.5, 0.5 );
let canvas_size = 400;
let canvas;

let animate_control = document.getElementById('animate_checkbox');
let level_control = document.getElementById('animate_level');
let azimuth_control = document.getElementById('camera_azimuth_control');
let altitude_control = document.getElementById('camera_altitide_control');


animate_control.onchange = animate_control.oninput = function(){
	let group = document.getElementById('surface-control-group');
	if(animate_control.checked){
		group.classList.add('invisible');
	} else {
		group.classList.remove('invisible');
	}
}

function init() {
	dummy_scene = new THREE.Scene();
	lines_scene = new THREE.Scene();
	dummy_camera = new THREE.Camera();
	position_camera = new THREE.PerspectiveCamera( Math.atan(1 / 2.) * (180. / Math.PI) * 2 /* degrees */, 1. /* aspect */, 1 /*near plane*/, 1000 /* far plane */ );
	dummy_geometry = new THREE.PlaneBufferGeometry( 2.0, 2.0 );

	let uniforms = {
			resolution: { value: new THREE.Vector2( canvas_size, canvas_size ) },
			cameraPos:  { value: position_camera.getWorldPosition() },
			cameraDir:  { value: position_camera.getWorldDirection() },
			weights_W : { type: "m4v", value: false }, // Matrix4 array, will be passed later
			weights_V : { type: "v4v", value: false }, // Vector4 array, will be passed later
			surface_level: {value: 0.}
	};

	dummy_material = new THREE.RawShaderMaterial( {
		uniforms: uniforms,
		vertexShader: raymarch_vertex_shader,
		fragmentShader: fragment_shader,
		transparent: true,
	} );
	dummy_mesh = new THREE.Mesh( dummy_geometry, dummy_material );
	dummy_scene.add( dummy_mesh );

	renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio( 1 );
	// renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( canvas_size, canvas_size );


	canvas = renderer.domElement;
	canvas.addEventListener( 'mousemove', function( e ) {
		mouse.x = e.offsetX / canvas.width;
		mouse.y = e.offsetY / canvas.height;
	});
	canvas.addEventListener( 'mouseleave', function(){
		mouse.x = 0.5;
		mouse.y = 0.5;
	});
	canvas.id = 'main_canvas';
	canvas.width = canvas_size;
	canvas.height = canvas_size;
	document.getElementById('canvas_container').appendChild( canvas );

	// TODO convert set of lines to a single line?
	lines_material = new THREE.ShaderMaterial( {
		uniforms:       uniforms,
		vertexShader:   lines_vertex_shader,
		fragmentShader: lines_fragment_shader,
		blending:       THREE.AdditiveBlending,
		depthTest:      false,
		depthWrite:		false,
		transparent:    true,
		wireframe: 		true,
	});

	let size = 4;
	for(let x_i=-size; x_i < size; x_i++) {
		for (let y_i=-size; y_i < size; y_i++) {
			for (let z_i=-size; z_i < size; z_i++) {
				let lines_geometry = new THREE.Geometry();
				for (let i = 0; i < 10; i++) {
					lines_geometry.vertices.push( new THREE.Vector3( x_i + 10 + i * 100, y_i, z_i ) );
				}
				lines_scene.add( new THREE.Line( lines_geometry, lines_material ) );
			}
		}
	}

	helper = new THREE.AxisHelper(5.);
	helper.material.transparent = true;
	helper.material.opacity = 0.6;
	lines_scene.add(helper);

	let show_surface_control = document.getElementById('show_surface_control')
	show_surface_control.onchange = function(){ dummy_mesh.material.visible = show_surface_control.checked; }
	let show_sparks_control = document.getElementById('show_sparks_control')
	show_sparks_control.onchange = function(){ lines_material.visible = show_sparks_control.checked; }
	let show_axes_control = document.getElementById('show_axes_control')
	show_axes_control.onchange = function(){ helper.material.visible = show_axes_control.checked; }
}


function render( timestamp, skip_request ) {
	// update camera, always look at the center
	let _y = 3.14 * (mouse.y - 0.5) / 2. + parseFloat(altitude_control.value);
	let _x = 3 * mouse.x + parseFloat(azimuth_control.value);
	let r = 12.;
	position_camera.position.set( r * Math.cos(_x) * Math.cos(_y), r * Math.sin(_y), r * Math.sin(_x) * Math.cos(_y));
	position_camera.lookAt( new THREE.Vector3( 0.0, 0.0, 0.0 ) );


	let weights_W = [new THREE.Matrix4(), new THREE.Matrix4()];
	weights_W[0].elements = Array.prototype.concat.apply([], [W[0], W[1], W[2], W[3]]);
	weights_W[1].elements = Array.prototype.concat.apply([], [W[4], W[5], W[6], W[7]]);
	let weights_V = [new THREE.Vector4(V[0][0], V[0][1], V[0][2], V[0][3]), new THREE.Vector4(V[0][4], V[0][5], V[0][6], V[0][7])];
	dummy_material.uniforms.weights_W.value = weights_W;
	dummy_material.uniforms.weights_V.value = weights_V;

	dummy_material.uniforms.resolution.value = new THREE.Vector2( renderer.getSize().width, renderer.getSize().width );
	dummy_material.uniforms.cameraPos.value = position_camera.getWorldPosition();
	dummy_material.uniforms.cameraDir.value = position_camera.getWorldDirection();
	let level_value = level_control.value;
	if ( animate_control.checked ) {
		level_value = (timestamp / (1000. * animation_loop) ) % 1;
	}

	dummy_material.uniforms.surface_level.value = level_value;
	renderer.autoClear = false;
	renderer.clear();
	renderer.render( lines_scene, position_camera );
	renderer.render( dummy_scene, dummy_camera );

	if( capturer ) capturer.capture( renderer.domElement );
	if( !skip_request) requestAnimationFrame( render );
}



let n_input = 3 + 1
let n_hidden = 8

function makeMatrix(m, n){
	let result = new Array(m);
	for (let i = 0; i < m; i++) {
		result[i] = new Array(n);
	}
	return result
}

function initWithRandomUniform(matrix, std){
	for(let i=0; i < matrix.length; i++){
		for(let j=0; j < matrix[i].length; j++){
			matrix[i][j] = (Math.random() * 2 - 1) * std;
		}
	}
}

let W = makeMatrix(n_hidden, n_input);
let V = makeMatrix(1, n_hidden);
let weights = [W, V];

function initWeightsRandom(){
	for(let i=0; i < weights.length; i++){
		initWithRandomUniform(weights[i], 1.);
	}
	let weight_cells = document.getElementsByClassName("weight-control");
	for (let i = 0; i < weight_cells.length; i++) {
		let cell = weight_cells[i];
		updateWeight(cell, 0.);
	}
}

initWeightsRandom();
document.getElementById('randomize_button').onclick = initWeightsRandom;

function addOnWheel(elem, handler) {
	if ('onwheel' in document) {
		// IE9+, FF17+
		elem.addEventListener("wheel", handler);
	} else if ('onmousewheel' in document) {
		// a bit deprecated
		elem.addEventListener("mousewheel", handler);
	} else {
		// 3.5 <= Firefox < 17
		elem.addEventListener("MozMousePixelScroll", handler);
	}
}


let control_cells = [];

let last_timestamp = + new Date();

function updateWeight(cell, delta){
	let timestamp = + new Date();

	// it is hard to make it work well on different devices / browsers / touchpads
	if ((delta != 0) && (timestamp - last_timestamp < 50)) return;
	last_timestamp = timestamp;
	delta = - Math.sign(delta) * 0.15;

	let layer = cell.position_layerij[0];
	let i = cell.position_layerij[1];
	let j = cell.position_layerij[2];
	let new_value = Math.max(-1, Math.min(1, weights[layer][j][i] + delta))
	weights[layer][j][i] = new_value;
	let value = Math.round(100 * (weights[layer][j][i] + 1) / 2.);
	cell.style.backgroundColor = "rgb(" + (50 + value) + ", 50," + (150 - value) + ")";
}

function createControlsTable() {
	let n_columns = n_input + 1 + 1 + 1;
	let n_rows = n_hidden + 1;
    let table = document.createElement('table');
	table.classList.add('control-table');
	for(let row = 0; row < n_rows; row++) {
		control_cells[row] = [];
	    let tablerow = table.insertRow(row);
		for(let col=0; col < n_columns; col++) {
			control_cells[row][col] = tablerow.insertCell();
		}
	}
	control_cells[0][0].innerHTML = 'x <br /> &darr;';
	control_cells[0][1].innerHTML = 'y <br /> &darr;';
	control_cells[0][2].innerHTML = 'z <br /> &darr;';
	control_cells[0][3].innerHTML = '1 <br /> &darr;';
	control_cells[0][0].style.color = '#fbb';
	control_cells[0][1].style.color = '#bbf';
	control_cells[0][2].style.color = '#bfb';
	for(let i = 0; i < n_hidden; i++) {
		control_cells[i + 1][n_input].innerHTML = ' &rarr; h<sub>'+ (i + 1) +'</sub> &rarr;';
	}
	control_cells[0][n_input + 1].innerHTML = 'output <br /> &uarr; '
	control_cells[0][n_input + 1].colSpan = "2";


	// first connection
	for(let i=0; i < n_input; i++) {
		for(let j=0; j < n_hidden; j++) {
			// swapping y and z for users pleasure
			let cell_position = [0, 2, 1, 3][i];
			let cell = control_cells[j+1][cell_position];
			cell.position_layerij = [0, i, j];
			cell.classList.add('weight-control');
		}
	}
	// second connection
	for(let i = 0; i < n_hidden; i++) {
		let cell = control_cells[i+1][n_input + 1];
		cell.position_layerij = [1, i, 0];
		cell.classList.add('weight-control');
	}

	document.getElementById('control_container').appendChild(table);

	// handlers for mousewheel
	let weight_cells = document.getElementsByClassName("weight-control");
	for (let i = 0; i < weight_cells.length; i++) {
		let cell = weight_cells[i];
		updateWeight(cell, 0.);
		addOnWheel(cell, function(e) {
			e.stopPropagation();
			e.preventDefault();
			let delta = e.deltaY || e.detail || e.wheelDelta || 0.;
			updateWeight(e.target, delta);
		});
	}
}

createControlsTable();
init();
render();

function saveAndDownloadVideo(format){
	let canvas = document.getElementById('main_canvas');
	let context = canvas.getContext('webgl');

	capturer = new CCapture( {
		format: format,
		framerate: 10 * 1.5,
		verbose: true,
		workersPath: 'utils/',
		name: 'neural_network_3d',
		quality: 95
	} );
	capturer.start();
	for(let timestamp = 0; timestamp < animation_loop * 1000; timestamp += 100){
		render(timestamp, true);
	}
	capturer.stop();
	capturer.save();
	capturer = null;
}

document.getElementById('makegif_button').onclick = function(){saveAndDownloadVideo('gif')};
document.getElementById('makemov_button').onclick = function(){saveAndDownloadVideo('webm')};
// so far we are running, so deleting notification
document.getElementById('not_working_notification').outerHTML = "";

