/**
 * @author Adam Kecskes <kecskes.adam@outlook.com>
 */

// The CSS3DObject and CSS3DSprite classes are preserved for compatibility
THREE.CSS3DObject = function (element) {

	THREE.Object3D.call(this);

	this.element = element;
	this.element.style.position = 'absolute';

	this.addEventListener('removed', function () {

		if (this.element.parentNode !== null) {

			this.element.parentNode.removeChild(this.element);

		}

	});

};

THREE.CSS3DObject.prototype = Object.assign(Object.create(THREE.Object3D.prototype), {

	isDomElement: true

});
THREE.CSS3DObject.prototype.constructor = THREE.CSS3DObject;

THREE.CSS3DSprite = function (element) {

	THREE.CSS3DObject.call(this, element);

	this.center = new THREE.Vector2(0.5, 0.5);

};

THREE.CSS3DSprite.prototype = Object.create(THREE.CSS3DObject.prototype);
THREE.CSS3DSprite.prototype.constructor = THREE.CSS3DSprite;

// CSS Renderer

THREE.CSS3DRenderer = function (parameters) {

	console.log('THREE.CSS3DRenderer', THREE.REVISION);

	parameters = parameters || {};
	var _this = this;

	var _width, _height;

	// Create containers, so it can render multiple overlapping scenes
	var active_container = null;
	this.domElement = document.createElement('div');

	var containers = [];

	var createContainer = function () {

		var container = new C3R.Container();
		container.domElement.style.position = "absolute";
		containers.push(container);
		return container;

	};

	var activateContainer = function (container, remove_current) {

		if (remove_current && active_container) {
			hideContainer(active_container);
		}

		container.setSize(_width, _height);

		active_container = container;

		if (container.domElement.parentNode !== _this.domElement) {

			_this.domElement.appendChild(container.domElement);

		}
	}

	var hideContainer = function (container) {

		if (container.domElement.parentNode === _this.domElement) {

			_this.domElement.removeChild(container.domElement);

		}

		if (active_container === container) {

			active_container = null;

		}
	};



	// Warn if some features can not be user

	if (!CSS.supports("clip-path: polygon(0% 0%,100% 0%,100% 100%)")) {

		console.warn("CSS clip-path is not supported in your browser. Polygons can not be rendered correctly");

	}

	if (!CSS.supports("background-blend-mode: multiply")) {

		console.warn("CSS background-blend-mode (multiply) is not supported in your browser. Sprites can not be rendered correctly");

	}

	if (!CSS.supports("transform: rotate(calc(90deg * var(--mult-value,1)))")) {

		console.warn("CSS calc and/or var is not supported in transformations in your browser");

	}

	var css_mask = CSS.supports("mask-image: var(--background-image, none)");
	var css_webkit_mask = CSS.supports("-webkit-mask-image: var(--background-image, none)");

	//https://stackoverflow.com/a/16436975

	var arraysEqual = function (a, b) {

		if (a === b) return true;
		if (a == null || b == null) return false;
		if (a.length != b.length) return false;

		// If you don't care about the order of the elements inside
		// the array, you should sort both arrays here.

		for (var i = 0; i < a.length; ++i) {

			if (a[i] !== b[i]) return false;

		}

		return true;

	}

	// List of objects, which needed update
	// One element in the scene graph can appear multiple times in the tree, so we need to update later
	var threejs_updated = [];

	var updateCamera = function (camera) {

		var changed = false;

		if (camera.isPerspectiveCamera) {

			if (active_container.camera instanceof C3R.PerspectiveCamera) {

				if (camera.fov !== active_container.camera.fov) {
					active_container.camera.fov = camera.fov;
					changed = true;
				}

			} else {

				active_container.camera = new C3R.PerspectiveCamera(active_container.camera.fov);
				changed = true;

			}

		} else if (camera.isOrthographicCamera) {

			if (active_container.camera instanceof C3R.OrthographicCamera) {

				if (
					camera.left !== active_container.camera.left ||
					camera.right !== active_container.camera.right ||
					camera.top !== active_container.camera.top ||
					camera.bottom !== active_container.camera.bottom
				) {

					active_container.camera.left = camera.left;
					active_container.camera.right = camera.right;
					active_container.camera.top = camera.top;
					active_container.camera.bottom = camera.bottom;

					changed = true;

				}

			} else {

				active_container.camera = new C3R.OrthographicCamera(camera.left, camera.right, camera.top, camera.bottom);
				changed = true;

			}

		}

		// Compare camera world inv matrices
		if (!mat4.equals(active_container.camera.matrix, camera.matrixWorldInverse.elements)) {

			mat4.copy(active_container.camera.matrix, camera.matrixWorldInverse.elements);
			changed = true;

		}

		if (changed) {

			active_container.updateCamera();

		}

	};


	var tMatrix = new THREE.Matrix4();
	var updateSpriteMatrix = function (three_object, c3d_object) {

		tMatrix.fromArray(active_container.camera.matrix);
		tMatrix.transpose();
		tMatrix.copyPosition(three_object.matrixWorld);
		tMatrix.multiplyMatrices(tMatrix, (new THREE.Matrix4()).extractRotation(three_object.matrixWorld).transpose());
		tMatrix.scale(three_object.scale);

		tMatrix.elements[3] = 0;
		tMatrix.elements[7] = 0;
		tMatrix.elements[11] = 0;
		tMatrix.elements[15] = 1;

		if (!vec2.equals([three_object.center.x, three_object.center.y], c3d_object.elementCenter)) {

			c3d_object.setCenter(three_object.center.x, three_object.center.y);

		}

		return tMatrix.elements;

	};

	var updateChildren = function (three_object, c3d_object) {

		var t_child_ids = [];
		var t_child_map = {};
		for (var i = 0; i < three_object.children.length; i++) {

			var child = three_object.children[i];
			t_child_ids.push(child.id);
			t_child_map[child.id] = child;

		}

		if (!c3d_object.threejs_children) {

			c3d_object.threejs_children = {};

		}

		var t_child_ids_current = Object.keys(c3d_object.threejs_children).map(Number);

		t_child_ids.sort();
		t_child_ids_current.sort();

		var child_change = !arraysEqual(t_child_ids, t_child_ids_current);
		if (child_change) {

			var threejs_children_next = {};

			// Insert added elements to the DOM
			three_object.children.forEach(function (three_child) {

				var c3d_node;

				if (c3d_object.threejs_children[three_child.id]) {

					c3d_node = c3d_object.threejs_children[three_child.id];

				} else {

					// CSS3D Object
					if (three_child.isDomElement) {
						var element = three_child.element;

						c3d_node = new C3R.CustomElement(element);

						c3d_node.domElement.style['backface-visibility'] = 'visible';

						c3d_object.addChild(c3d_node);
						c3d_node.threejs_id = three_child.id;

					} else if (three_child.isSprite) {

						var element = document.createElement('div');

						element.style['background-blend-mode'] = 'multiply';

						if (css_mask) {
							element.style['mask-image'] = 'var(--background-image, none)';
						} else if (css_webkit_mask) {
							element.style['-webkit-mask-image'] = 'var(--background-image, none)';
						}

						c3d_node = new C3R.CustomElement(element);

						c3d_node.setSize(128, 128);
						c3d_node.setScale(1 / 128, 1 / 128);

						c3d_object.addChild(c3d_node);
						c3d_node.threejs_id = three_child.id;

					} else {
						c3d_node = new C3R.Group();
						c3d_object.addChild(c3d_node);
						c3d_node.threejs_id = three_child.id;
					}

				}

				threejs_children_next[three_child.id] = c3d_node;

			});

			// Remove elements from DOM, which are not in the children array
			for (var threejs_id in c3d_object.threejs_children) {

				if (!t_child_map[threejs_id]) {

					c3d_object.removeChild(
						c3d_object.threejs_children[threejs_id]
					);

				}

			}

			c3d_object.threejs_children = threejs_children_next;

		}

		// Update child nodes
		for (var threejs_id in c3d_object.threejs_children) {

			var c = c3d_object.threejs_children[threejs_id];
			updateObject(t_child_map[threejs_id], c);

		}

	};

	var updateMesh = function (three_object, c3d_object) {

		var geometry = three_object.geometry;

		if (!geometry.isBufferGeometry) {

			// TODO: support for not just bufferGeometry
			three_object.geometry = geometry = (new THREE.BufferGeometry()).fromGeometry(geometry);

		}

		var indexed = !!geometry.index;

		var groups = geometry.groups;
		if (!groups || groups.length === 0) {

			var dr = Object.assign({}, geometry.drawRange);
			dr.materialIndex = 0;

			if (dr.count == Infinity) {

				dr.count = indexed ? geometry.index.count : geometry.attributes.position.count;

			}

			groups = [dr];

		}

		if (
			(indexed && (geometry.index.version === 0 || geometry.index.needsUpdate)) ||

			(geometry.attributes.position.version === 0 || geometry.attributes.position.needsUpdate) ||
			(geometry.attributes.uv.version === 0 || geometry.attributes.uv.needsUpdate)
		) {

			if (indexed) {

				threejs_updated.push(geometry.index);

			}

			threejs_updated.push(geometry.attributes.position, geometry.attributes.uv);

			// Remove old content
			(c3d_object.threejs_groups || []).forEach(function (gr) {

				c3d_object.removeChild(gr);

			});

			var indices = indexed ? geometry.index.array : [];
			var positions = geometry.attributes.position.array;
			var uvs = geometry.attributes.uv.array;

			var threejs_groups = [];

			for (var g = 0; g < groups.length; g++) {

				var c3d_group = new C3R.Group();

				c3d_group.threejs_tex_repeat = [1, 1];
				c3d_group.threejs_tex_offset = [0, 0];

				var start = groups[g].start;
				var end = start + groups[g].count;
				for (var i = start; i < end; i += 3) {

					var i1, i2, i3;

					if (indexed) {
						i1 = indices[i + 0];
						i2 = indices[i + 1];
						i3 = indices[i + 2];
					} else {
						i1 = i + 0;
						i2 = i + 1;
						i3 = i + 2;
					}

					var p1 = vec3.fromValues(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
					var p2 = vec3.fromValues(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
					var p3 = vec3.fromValues(positions[i3 * 3], positions[i3 * 3 + 1], positions[i3 * 3 + 2]);

					var t1 = vec2.fromValues(uvs[i1 * 2], uvs[i1 * 2 + 1]);
					var t2 = vec2.fromValues(uvs[i2 * 2], uvs[i2 * 2 + 1]);
					var t3 = vec2.fromValues(uvs[i3 * 2], uvs[i3 * 2 + 1]);

					c3d_group.pushPolygon([
						new C3R.Vertex(p1, t1),
						new C3R.Vertex(p2, t2),
						new C3R.Vertex(p3, t3)
					]);

				}

				c3d_group.flushPolygons();

				c3d_object.addChild(c3d_group);

				threejs_groups.push(c3d_group);

			}

			c3d_object.threejs_groups = threejs_groups;

		}

		// Materials

		var multi_material = Array.isArray(three_object.material);
		var threejs_materials = multi_material ? three_object.material : [three_object.material];

		for (var g = 0; g < groups.length; g++) {

			var c3d_group = c3d_object.threejs_groups[g];
			var threejs_material = threejs_materials[groups[g].materialIndex % threejs_materials.length];

			updateObjectMaterial(threejs_material, c3d_group);

		}
	};

	var updateSpriteMaterial = function (three_object, c3d_object) {

		if (three_object.material) {

			if (three_object.material.rotation != c3d_object.elementRotation) {

				c3d_object.elementRotation = three_object.material.rotation;
				c3d_object.updateElementTransform();

			}

			updateObjectMaterial(three_object.material, c3d_object);

		}

	};

	var updateObject = function (three_object, c3d_object) {

		// Compare object matrices
		var three_matrix = three_object.matrix.elements;

		if ((three_object instanceof THREE.CSS3DSprite) || three_object.isSprite) {

			three_matrix = updateSpriteMatrix(three_object, c3d_object);

		}

		if (!mat4.equals(c3d_object.matrix, three_matrix)) {

			mat4.copy(c3d_object.matrix, three_matrix);
			c3d_object.updateMatrix();

		}

		// Update content

		updateChildren(three_object, c3d_object);

		if (three_object.isSprite) {

			updateSpriteMaterial(three_object, c3d_object);

		}

		if (three_object.isMesh) {

			updateMesh(three_object, c3d_object);

		}

	};

	var updateObjectMaterial = function (threejs_material, c3d_object) {

		if (!c3d_object.material || c3d_object.material.threejs_id !== threejs_material.id) {

			c3d_object.material = new C3R.Material();
			c3d_object.material.threejs_id = threejs_material.id;

		}

		var material_needs_update = false;
		if (threejs_material.map && threejs_material.map.image) {

			var img = threejs_material.map.image;
			switch (img.tagName) {

			case 'IMG':

				if (c3d_object.material.backgroundImageSrc !== img.src) {

					c3d_object.material.backgroundImageSrc = img.src;
					material_needs_update = true;

				}

				break;

			case 'CANVAS':

				if (c3d_object.material.threejs_version !== threejs_material.map.version) {

					c3d_object.material.backgroundImageSrc = img.toDataURL();
					c3d_object.material.threejs_version = threejs_material.map.version;
					material_needs_update = true;

				}

				break;

			}

		} else {

			if (c3d_object.material.backgroundImageSrc) {

				c3d_object.material.backgroundImageSrc = null;
				material_needs_update = true;

			}

		}

		if (threejs_material.color) {

			var col = vec4.fromValues(
				threejs_material.color.r,
				threejs_material.color.g,
				threejs_material.color.b,
				1.0
			);

			if (!c3d_object.material.backgroundColor || !vec4.equals(col, c3d_object.material.backgroundColor)) {

				c3d_object.material.backgroundColor = col;
				material_needs_update = true;

			}

		} else {

			if (c3d_object.material.backgroundColor) {

				c3d_object.material.backgroundColor = null;
				material_needs_update = true;

			}

		}

		if (threejs_material.opacity != c3d_object.material.opacity) {

			c3d_object.material.opacity = threejs_material.opacity;
			material_needs_update = true;

		}

		if (material_needs_update) {

			c3d_object.updateMaterial();

		}

		// TODO: Check if child supports texture repeat?
		if (c3d_object.threejs_tex_repeat && c3d_object.threejs_tex_offset) {

			var tex_repeat = threejs_material.map ? [threejs_material.map.repeat.x, threejs_material.map.repeat.y] : [1, 1];
			var tex_offset = threejs_material.map ? [threejs_material.map.offset.x, threejs_material.map.offset.y] : [0, 0];

			if (!vec2.equals(c3d_object.threejs_tex_repeat, tex_repeat) ||
				!vec2.equals(c3d_object.threejs_tex_offset, tex_offset)
			) {

				c3d_object.threejs_tex_repeat = tex_repeat;
				c3d_object.threejs_tex_offset = tex_offset;

				c3d_object.children.forEach(function (child) {

					if (!child instanceof C3R.Polygon) {
						return;
					}

					child.uv_scale = tex_repeat;
					child.uv_offset = tex_offset;

					child.updateContent();

				});

			}

		}

	};

	// Public Renderer functions and attributes
	// Some of them is only provided for compatibility

	this.autoClear = true;

	this.setClearColor = function (col) {

		_this.domElement.style.backgroundColor = 'rgb(' + [
			Math.round(col.r * 255),
			Math.round(col.g * 255),
			Math.round(col.b * 255)
		].join() + ')';

	};

	this.getSize = function () {

		return {
			width: _width,
			height: _height
		};

	};

	this.setSize = function (width, height) {

		_width = width;
		_height = height;

		_this.domElement.style.width = width + "px";
		_this.domElement.style.height = height + "px";

		if (active_container) {
			active_container.setSize(width, height);
		}

	};

	this.setPixelRatio = function (val) {};

	this.clearDepth = function () {};

	var clearNext = false;
	this.clear = function () {

		clearNext = true;

	};

	this.shadowMap = {

		render: function () {}

	};

	this.render = function (scene, camera) {

		if (clearNext) {

			// TODO: Hide containers except the currently rendered ones
			// collect the rendered containers in an array, and clear the others with a timeout? 

			clearNext = false;

		}

		if (!active_container || active_container.threejs_id !== scene.id) {

			var new_container = containers.find(function (container) {

				return container.threejs_id === scene.id;

			});

			if (!new_container) {

				new_container = createContainer();
				new_container.threejs_id = scene.id;

			}

			activateContainer(new_container);

		}

		scene.updateMatrixWorld();

		if (camera.parent === null) {

			camera.updateMatrixWorld();

		}

		updateCamera(camera);
		updateObject(scene, active_container.root);

		threejs_updated.forEach(function (o) {

			if (o.needsUpdate) {
				o.needsUpdate = false;
			} else if (o.isBufferAttribute && o.version === 0) {
				o.version = 1;
			}

		});

		threejs_updated = [];

	};

};