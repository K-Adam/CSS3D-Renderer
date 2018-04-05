/**
 * @license
 * The MIT License
 * 
 * Copyright © 2018 Adam Kecskes
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();

var get = function get(object, property, receiver) {
  if (object === null) object = Function.prototype;
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent === null) {
      return undefined;
    } else {
      return get(parent, property, receiver);
    }
  } else if ("value" in desc) {
    return desc.value;
  } else {
    var getter = desc.get;

    if (getter === undefined) {
      return undefined;
    }

    return getter.call(receiver);
  }
};

var inherits = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
};

var possibleConstructorReturn = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && (typeof call === "object" || typeof call === "function") ? call : self;
};

var toConsumableArray = function (arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

    return arr2;
  } else {
    return Array.from(arr);
  }
};

var CSSClass = function () {
    function CSSClass() {
        classCallCheck(this, CSSClass);


        this.class_name = "c3r-" + CSSClass.id_counter++;

        this.properties = new Map();

        this.domElement = document.createElement("style");
    }

    createClass(CSSClass, [{
        key: "init",
        value: function init() {
            document.head.appendChild(this.domElement);
        }
    }, {
        key: "unload",
        value: function unload() {
            document.head.removeChild(this.domElement);
        }
    }, {
        key: "attach",
        value: function attach(elem) {
            elem.classList.add(this.class_name);
        }
    }, {
        key: "detach",
        value: function detach(elem) {
            elem.classList.remove(this.class_name);
        }
    }, {
        key: "setProperty",
        value: function setProperty(prop, val) {
            this.properties.set(prop, val);
        }
    }, {
        key: "setProperties",
        value: function setProperties(props) {
            for (var i in props) {
                this.setProperty(i, props[i]);
            }
        }
    }, {
        key: "update",
        value: function update() {

            this.domElement.innerHTML = '.' + this.class_name + '{' + Array.from(this.properties.entries()).map(function (kv) {
                return kv.join(':');
            }).join(';') + '}';
        }
    }, {
        key: "clone",
        value: function clone() {

            var cl = new CSSClass();
            cl.properties = new Map(this.properties);
            return cl;
        }
    }]);
    return CSSClass;
}();

CSSClass.id_counter = 0;

var Material = function () {
    function Material() {
        classCallCheck(this, Material);


        this.backgroundImageSrc = null;
        this.backgroundColor = null; // vec4 0-1
        this.opacity = 1.0;
    }

    createClass(Material, [{
        key: "apply",
        value: function apply(elem) {

            if (this.backgroundImageSrc) {
                elem.style.setProperty("--background-image", "url('" + this.backgroundImageSrc + "')");
            } else {
                elem.style.removeProperty("--background-image");
            }

            if (this.backgroundColor) {
                elem.style.setProperty("--background-color", "rgba(" + [Math.round(this.backgroundColor[0] * 255), Math.round(this.backgroundColor[1] * 255), Math.round(this.backgroundColor[2] * 255), this.backgroundColor[3]].join() + ")");
            } else {
                elem.style.removeProperty("--background-color");
            }

            if (this.opacity == 1.0) {
                elem.style.removeProperty("--opacity");
            } else {
                elem.style.setProperty("--opacity", this.opacity);
            }
        }
    }]);
    return Material;
}();

var Object3D = function () {
    function Object3D() {
        classCallCheck(this, Object3D);


        this.matrix = mat4.create();

        this.domElement = document.createElement('div');

        this.material = null;
    }

    // set transform property 


    createClass(Object3D, [{
        key: 'updateMatrix',
        value: function updateMatrix() {
            this.domElement.style.transform = 'matrix3d(' + this.matrix.join() + ')';
        }
    }, {
        key: 'clearMatrix',
        value: function clearMatrix() {
            this.matrix = mat4.create();
            this.domElement.style.transform = "";
        }
    }, {
        key: 'updateMaterial',
        value: function updateMaterial() {
            if (this.material) {
                this.material.apply(this.domElement);
            }
        }

        // Used in Group and Polygon

    }], [{
        key: 'getCommonAttributes',
        value: function getCommonAttributes() {
            return {
                "position": "absolute",
                "display": "block",

                "transform": "matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)",
                "transform-origin": "0 0",

                /* disable selection */
                "-webkit-user-select": "none",
                "-moz-user-select": "none",
                "-ms-user-select": "none",
                "user-select": "none",

                /* Prefix still needed for Safari? */
                "-webkit-backface-visibility": "inherit",
                "backface-visibility": "inherit"
            };
        }
    }]);
    return Object3D;
}();

// 3D triangle, represented by 3 points
var Triangle = function () {
    function Triangle(p1, p2, p3, norm) {
        classCallCheck(this, Triangle);

        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;

        this.edges = null;

        this.norm = norm ? norm : this.calculateNormal();
    }

    createClass(Triangle, [{
        key: "updateEdges",
        value: function updateEdges() {

            if (this.edges) return;

            this.edges = [vec3.sub(vec3.create(), this.p1, this.p2), vec3.sub(vec3.create(), this.p2, this.p3), vec3.sub(vec3.create(), this.p3, this.p1)];
        }
    }, {
        key: "calculateNormal",
        value: function calculateNormal() {

            this.updateEdges();

            return vec3.normalize(vec3.create(), vec3.cross(vec3.create(), this.edges[0], this.edges[1]));
        }
    }, {
        key: "calculateEdgeLengths",
        value: function calculateEdgeLengths() {
            return vec3.fromValues(vec3.len(this.edges[0]), vec3.len(this.edges[1]), vec3.len(this.edges[2]));
        }
    }, {
        key: "getTransformationTo",
        value: function getTransformationTo(that) {

            var A = mat4.fromValues(this.p1[0], this.p1[1], this.p1[2], 1, this.p2[0], this.p2[1], this.p2[2], 1, this.p3[0], this.p3[1], this.p3[2], 1, this.norm[0], this.norm[1], this.norm[2], 0);

            var B = mat4.fromValues(that.p1[0], that.p1[1], that.p1[2], 1, that.p2[0], that.p2[1], that.p2[2], 1, that.p3[0], that.p3[1], that.p3[2], 1, that.norm[0], that.norm[1], that.norm[2], 0);

            return mat4.mul(mat4.create(), B, mat4.invert(mat4.create(), A));
        }
    }]);
    return Triangle;
}();

var isWebKit = 'WebkitAppearance' in document.documentElement.style;

var css_mask = CSS.supports("mask-image: var(--background-image, none)");
var css_webkit_mask = CSS.supports("-webkit-mask-image: var(--background-image, none)");

var css_clip_path = CSS.supports("clip-path: polygon(50% 0%, 0% 100%, 100% 100%)");
var css_webkit_clip_path = CSS.supports("-webkit-clip-path: polygon(50% 0%, 0% 100%, 100% 100%)");

var default_dom_size = function default_dom_size(num) {
    return Math.max(250, Math.min(num, 1200));
};

var cross2 = function cross2(a, b, o) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
};

var Polygon = function (_Object3D) {
    inherits(Polygon, _Object3D);

    function Polygon(vertices) {
        var contentElement = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        classCallCheck(this, Polygon);

        var _this = possibleConstructorReturn(this, (Polygon.__proto__ || Object.getPrototypeOf(Polygon)).call(this));

        _this.vertices = vertices; // vertices in CCW
        _this.clipPath = []; // path of the polygon on a rectangular element

        _this.simplify();

        Polygon.getClass().attach(_this.domElement);

        // Base size of the dom element ( in case of a triangle, it will be the length of the longest side)
        _this.getDomSize = default_dom_size;

        // Actual size of the dom element
        _this.block_width = 0;
        _this.block_height = 0;

        // texture / element / etc
        _this.contentElement = contentElement ? contentElement : document.createElement('div');
        Polygon.getContentClass().attach(_this.contentElement);
        _this.domElement.appendChild(_this.contentElement);

        _this.uv_scale = vec2.fromValues(1, 1);
        _this.uv_offset = vec2.fromValues(0, 0);

        // triangle only data
        _this.maxi = 0; // Index of the longest side

        return _this;
    }

    // remove redundant vertices ( which are on the same line )


    createClass(Polygon, [{
        key: 'simplify',
        value: function simplify() {
            var vertices = [this.vertices[0]];

            for (var i = 1; i < this.vertices.length; i++) {

                var prev_i = i - 1;
                var next_i = (i + 1) % this.vertices.length;

                var p1 = this.vertices[prev_i].position;
                var p2 = this.vertices[i].position;
                var p3 = this.vertices[next_i].position;

                var e1 = vec3.sub(vec3.create(), p1, p2);
                var e2 = vec3.sub(vec3.create(), p2, p3);

                vec3.normalize(e1, e1);
                vec3.normalize(e2, e2);

                // Not collinear
                if (Math.abs(vec3.dot(e1, e2)) < 0.9999) {
                    vertices.push(this.vertices[i]);
                }
            }

            this.vertices = vertices;
        }
    }, {
        key: 'updateMatrix',
        value: function updateMatrix() {

            // The first three polygon points should be transformed to this positions
            var tri = new Triangle(this.vertices[0].position, this.vertices[1].position, this.vertices[2].position);

            // Faster method for triangles
            if (this.vertices.length == 3) {

                // The longest side will be the base
                var ln = tri.calculateEdgeLengths();

                this.maxi = ln.indexOf(Math.max.apply(Math, toConsumableArray(ln)));

                var ai = this.maxi;
                var bi = (this.maxi + 1) % 3;
                var ci = (this.maxi + 2) % 3;

                var a = ln[ai];
                var b = ln[bi];
                var c = ln[ci];

                var Ax = -(b * b - c * c - a * a) / (2 * a);
                var Ay = Math.sqrt(c * c - Ax * Ax);

                // Where the longest side is split into two by the height-line
                var base_split = Ax / a;

                // scale the element, to avoid blurry texture

                var scale_ratio = this.getDomSize(a) / a;

                this.block_width = a * scale_ratio;
                this.block_height = Ay * scale_ratio;
                //

                this.clipPath = [vec2.fromValues(0, 0), vec2.fromValues(1, 0), vec2.fromValues(base_split, 1)];

                var tri_v = [vec3.fromValues(0, 0, 0), vec3.fromValues(this.block_width, 0, 0), vec3.fromValues(Ax * scale_ratio, this.block_height, 0)];

                this.matrix = new Triangle(tri_v[ai], tri_v[bi], tri_v[ci], [0, 0, 1]).getTransformationTo(tri);
            } else if (this.vertices.length > 3) {

                //////////////////////////////////////////////
                // Project polygon points to the 2D plane
                //////////////////////////////////////////////

                // get new bases
                var b1 = tri.norm;
                var b2 = Math.abs(vec3.dot(b1, [0, 0, 1])) < 0.9 ? vec3.cross(vec3.create(), b1, [0, 0, 1]) : vec3.cross(vec3.create(), b1, [0, 1, 0]);
                var b3 = vec3.cross(vec3.create(), b2, b1);

                // Base change matrices
                var BT = mat3.fromValues(b2[0], b2[1], b2[2], b3[0], b3[1], b3[2], b1[0], b1[1], b1[2]);

                var BTI = mat3.invert(mat3.create(), BT);

                if (BTI === null) {
                    throw new Error("Degenerate triangle?");
                }

                // Transform points with the matrices
                var points2d = this.vertices.map(function (v) {
                    var pp = vec3.transformMat3(vec3.create(), v.position, BTI);
                    return pp.slice(0, 2);
                });

                //////////////////////////////////////////////
                // Find convex hull
                //////////////////////////////////////////////

                // https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain

                var points = points2d.slice().sort(function (a, b) {
                    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
                });

                var lower = [];
                for (var _i = 0; _i < points.length; _i++) {
                    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], points[_i]) <= 0) {
                        lower.pop();
                    }
                    lower.push(points[_i]);
                }

                var upper = [];
                for (var _i2 = points.length - 1; _i2 >= 0; _i2--) {
                    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], points[_i2]) <= 0) {
                        upper.pop();
                    }
                    upper.push(points[_i2]);
                }

                upper.pop();
                lower.pop();

                var hull = lower.concat(upper);

                //////////////////////////////////////////////
                // Find bounding box
                //////////////////////////////////////////////

                // For each edge (of the hull), transform the points to make it axis aligned
                // Find the AABB with the smallest area

                var min_area = Number.POSITIVE_INFINITY;
                //let corners = [];
                var min_bounds = [];
                var min_T = mat2.create();
                var min_TI = mat2.create();

                var _loop = function _loop() {

                    var side = vec2.sub(vec2.create(), hull[i], hull[(i + 1) % hull.length]);
                    vec2.normalize(side, side);

                    var AT = mat2.fromValues(side[0], side[1], side[1], -side[0]);
                    var ATI = mat2.invert(mat2.create(), AT);

                    var tpoints = hull.map(function (p) {
                        return vec2.transformMat2(vec2.create(), p, ATI);
                    });

                    // [xmin, xmax, ymin, ymax]
                    var bounds = tpoints.map(function (p) {
                        return [p[0], p[0], p[1], p[1]];
                    }).reduce(function (a, b) {
                        return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])];
                    });

                    var area = (bounds[1] - bounds[0]) * (bounds[3] - bounds[2]);
                    if (area < min_area) {
                        min_area = area;

                        min_bounds = bounds;
                        min_TI = ATI;
                    }
                };

                for (var i = 0; i < hull.length; i++) {
                    _loop();
                }

                //

                var box_width = min_bounds[1] - min_bounds[0];
                var box_height = min_bounds[3] - min_bounds[2];

                var _scale_ratio = 1;

                // scale the element, to avoid blurry texture
                if (box_width > box_height) {
                    _scale_ratio = this.getDomSize(box_width) / box_width;
                } else {
                    _scale_ratio = this.getDomSize(box_height) / box_height;
                }

                this.block_width = box_width * _scale_ratio;
                this.block_height = box_height * _scale_ratio;

                var clipPoints = points2d.map(function (p) {
                    return vec2.sub(vec2.create(), vec2.transformMat2(vec2.create(), p, min_TI), [min_bounds[0], min_bounds[2]]);
                });

                this.clipPath = clipPoints.map(function (p2) {
                    return vec2.fromValues(p2[0] / box_width, p2[1] / box_height);
                });

                this.matrix = new Triangle(vec3.fromValues(clipPoints[0][0] * _scale_ratio, clipPoints[0][1] * _scale_ratio, 0), vec3.fromValues(clipPoints[1][0] * _scale_ratio, clipPoints[1][1] * _scale_ratio, 0), vec3.fromValues(clipPoints[2][0] * _scale_ratio, clipPoints[2][1] * _scale_ratio, 0)).getTransformationTo(tri);
            } else {

                throw new Error("The polygon has not enough sides");
            }

            var clipData = 'polygon(' + this.clipPath.map(function (p) {
                return p[0] * 100 + '% ' + p[1] * 100 + '%';
            }).join() + ')';
            if (css_clip_path) {
                this.domElement.style.clipPath = clipData;
            } else if (css_webkit_clip_path) {
                this.domElement.style['-webkit-clip-path'] = clipData;
            }

            //this.domElement.style.width = this.block_width+"px";
            //this.domElement.style.height = this.block_height+"px";

            // We need the width/height information in the childNode to properly position and scale the texture
            // If we use width/height CSS values, then we can rescale this element, without calling updateContent

            this.domElement.style.setProperty("--width", this.block_width + "px");
            this.domElement.style.setProperty("--height", this.block_height + "px");

            get(Polygon.prototype.__proto__ || Object.getPrototypeOf(Polygon.prototype), 'updateMatrix', this).call(this);
        }
    }, {
        key: 'updateContent',
        value: function updateContent() {
            var _this2 = this;

            // uv_scale
            var uvs = this.vertices.map(function (v) {
                var ret = vec2.mul(vec2.create(), v.uv, _this2.uv_scale);
                vec2.add(ret, ret, _this2.uv_offset);
                return ret;
            });

            // handle texture repeat
            var tex_bounds = uvs.map(
            // [xmin, xmax, ymin, ymax]
            function (uv) {
                return [uv[0], uv[0], uv[1], uv[1]];
            }).reduce(function (a, b) {
                return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])];
            });

            var txmin = tex_bounds[0];
            var txmax = tex_bounds[1];
            var tymin = tex_bounds[2];
            var tymax = tex_bounds[3];

            var xsize = txmax - txmin;
            var ysize = tymax - tymin;

            var scx = 1 / xsize,
                scy = 1 / ysize;

            this.contentElement.style.backgroundPosition = 'calc(var(--width) * ' + -txmin * scx + ') calc(var(--height) * ' + (1 + tymin * scy) + ')';
            this.contentElement.style.backgroundSize = 100 * scx + '% ' + 100 * scy + '%';

            var TA = mat3.fromValues((uvs[0][0] - txmin) / xsize, 1 - (uvs[0][1] - tymin) / ysize, 1, (uvs[1][0] - txmin) / xsize, 1 - (uvs[1][1] - tymin) / ysize, 1, (uvs[2][0] - txmin) / xsize, 1 - (uvs[2][1] - tymin) / ysize, 1);

            var ai = void 0,
                bi = void 0,
                ci = void 0;
            // use the longest side as base if it is a triangle
            if (this.vertices.length == 3) {
                ai = this.maxi;
                bi = (this.maxi + 1) % 3;
                ci = (this.maxi + 2) % 3;
            } else {
                ai = 0;
                bi = 1;
                ci = 2;
            }

            var TB = mat3.fromValues(this.clipPath[ai][0], this.clipPath[ai][1], 1, this.clipPath[bi][0], this.clipPath[bi][1], 1, this.clipPath[ci][0], this.clipPath[ci][1], 1);

            var TX = mat3.mul(mat3.create(), TB, mat3.invert(mat3.create(), TA));

            var bh = this.block_height / this.block_width;
            this.contentElement.style.transform = "translate(" + [TX[6] * 100 + "%", TX[7] * 100 + "%"].join() + ")" + "matrix(" + [TX[0], TX[1] * bh, TX[3] / bh, TX[4], 0, 0].join() + ")";
        }
    }], [{
        key: 'getClass',
        value: function getClass() {

            if (!css_class) {
                css_class = new CSSClass();
                css_class.setProperties({
                    "width": "var(--width, 0px)",
                    "height": "var(--height, 0px)",

                    "opacity": "var(--opacity, 1)",

                    "transform-style": "flat",
                    "overflow": "hidden"
                });
                css_class.setProperties(Object3D.getCommonAttributes());
                css_class.update();
                css_class.init();
            }

            return css_class;
        }
    }, {
        key: 'getContentClass',
        value: function getContentClass() {

            if (!css_content_class) {

                css_content_class = new CSSClass();
                css_content_class.setProperties({
                    "width": "100%",
                    "height": "100%",

                    "background-color": "var(--background-color, white)",
                    "background-image": "var(--background-image, none)",
                    "background-size": "100% 100%",

                    "background-blend-mode": "multiply",

                    "transform": "matrix(1, 0, 0, 1, 0, 0)",
                    "transform-origin": "0 0"
                });

                /*
                if(css_mask) {
                    css_content_class.setProperties({
                        'mask-image': 'var(--background-image, none)',
                        'mask-size': '100% 100%'
                    });
                } else if(css_webkit_mask) {
                    css_content_class.setProperties({
                        '-webkit-mask-image': 'var(--background-image, none)',
                        '-webkit-mask-size': '100% 100%'
                    });
                }*/

                css_content_class.update();
                css_content_class.init();
            }

            return css_content_class;
        }
    }]);
    return Polygon;
}(Object3D);

var css_class = null;
var css_content_class = null;

var Group = function (_Object3D) {
    inherits(Group, _Object3D);

    function Group() {
        classCallCheck(this, Group);

        var _this = possibleConstructorReturn(this, (Group.__proto__ || Object.getPrototypeOf(Group)).call(this));

        Group.getClass().attach(_this.domElement);

        _this.children = [];

        //
        _this.vert_cache = null;
        _this.norm_cache = null;
        _this.vec2tex = null;

        return _this;
    }

    createClass(Group, [{
        key: 'addChild',
        value: function addChild(obj) {

            this.children.push(obj);
            this.domElement.appendChild(obj.domElement);
        }
    }, {
        key: 'removeChild',
        value: function removeChild(obj) {

            var index = this.children.indexOf(obj);

            if (index > -1) {
                this.removeChildIndex(index);
            }
        }
    }, {
        key: 'removeChildIndex',
        value: function removeChildIndex(index) {

            var obj = this.children[index];

            this.children.splice(index, 1);
            this.domElement.removeChild(obj.domElement);
        }
    }, {
        key: 'clear',
        value: function clear() {

            var i = this.children.length;
            while (i-- > 0) {
                this.removeChildIndex(i);
            }
        }

        // 

    }, {
        key: 'addPolygon',
        value: function addPolygon(vertices) {
            var element = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;


            var poly = new Polygon(vertices, element);

            poly.updateMatrix();
            poly.updateContent();

            this.addChild(poly);

            return poly;
        }

        // Adding triangles with this method makes it possible to reconstruct polygons (like quads)
        // The polygon (defined by vertices) will be added at last when flushPolygons() is called

    }, {
        key: 'pushPolygon',
        value: function pushPolygon(vertices) {
            var _this2 = this;

            // TODO: if vertices.length > 3, then we should compare more than 1 edge

            // Calculate the normal from vertices
            var norm = new Triangle(vertices[0].position, vertices[1].position, vertices[2].position).norm;

            // If there is already a polygon in the cache, compare the current vertices with it
            if (this.vert_cache) {

                var same_plane = vec3.equals(this.norm_cache, norm);

                // Check if they are on the same plane
                if (same_plane) {

                    // Check if the two polygon shares an edge
                    var shares_edge = false;
                    for (var i = 0; i < this.vert_cache.length; i++) {

                        var c_vert = this.vert_cache[i];

                        for (var j = 0; j < vertices.length; j++) {

                            var vert = vertices[j];

                            // First we compare single points
                            if (vec2.equals(c_vert.uv, vert.uv) && vec3.equals(c_vert.position, vert.position)) {

                                var c_vert_next = this.vert_cache[(i + 1) % this.vert_cache.length];
                                var vert_prev = vertices[(j + vertices.length - 1) % vertices.length];

                                // If we find the same point in both of them, then compare the other vertex on the edge
                                if (vec2.equals(c_vert_next.uv, vert_prev.uv) && vec3.equals(c_vert_next.position, vert_prev.position)) {

                                    // Merge polygons
                                    var start = this.vert_cache.slice(0, i + 1);
                                    var end = this.vert_cache.slice(i + 1);

                                    var ins = [];
                                    for (var k = 1; k < vertices.length - 1; k++) {
                                        ins.push(vertices[(j + k) % vertices.length]);
                                    }

                                    // Compare texture coords
                                    if (!ins.every(function (v) {

                                        var uv = vec3.transformMat4(vec3.create(), v.position, _this2.vec2tex).slice(0, 2);

                                        return vec2.equals(uv, v.uv);
                                    })) {
                                        continue;
                                    }

                                    this.vert_cache = start.concat(ins, end);

                                    shares_edge = true;
                                    break;
                                }
                            }
                        }

                        if (shares_edge) {
                            break;
                        }
                    }

                    if (!shares_edge) {
                        this.flushPolygons();
                    }
                } else {
                    this.flushPolygons();
                }
            }

            // If it was empty or flushed, store verts in cache
            if (!this.vert_cache) {
                this.vert_cache = vertices;
                this.norm_cache = norm;

                this.vec2tex = new Triangle(vertices[0].position, vertices[1].position, vertices[2].position, norm).getTransformationTo(new Triangle(vec3.fromValues(this.vert_cache[0].uv[0], this.vert_cache[0].uv[1], 0), vec3.fromValues(this.vert_cache[1].uv[0], this.vert_cache[1].uv[1], 0), vec3.fromValues(this.vert_cache[2].uv[0], this.vert_cache[2].uv[1], 0)));
            }
        }
    }, {
        key: 'flushPolygons',
        value: function flushPolygons() {

            if (this.vert_cache) {
                this.addPolygon(this.vert_cache);

                this.vert_cache = null;
                this.norm_cache = null;
                this.vec2tex = null;
            }
        }
    }], [{
        key: 'getClass',
        value: function getClass() {

            if (!css_class$1) {
                css_class$1 = new CSSClass();
                css_class$1.setProperties({
                    /* Center element */
                    "width": "0px",
                    "height": "0px",

                    "transform-style": "preserve-3d",
                    "overflow": "visible"
                });
                css_class$1.setProperties(Object3D.getCommonAttributes());
                css_class$1.update();
                css_class$1.init();
            }

            return css_class$1;
        }
    }]);
    return Group;
}(Object3D);

var css_class$1 = null;

var PerspectiveCamera = function () {
    function PerspectiveCamera() {
        var fov = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 70;
        classCallCheck(this, PerspectiveCamera);


        this.fov = fov;

        // Inverse world
        this.matrix = mat4.create();
    }

    createClass(PerspectiveCamera, [{
        key: "perspective_coefficient",
        get: function get$$1() {
            return 1.0 / Math.tan(this.fov * Math.PI / 360);
        }
    }]);
    return PerspectiveCamera;
}();

var OrthographicCamera = function OrthographicCamera(left, right, top, bottom) {
    classCallCheck(this, OrthographicCamera);


    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;

    // Inverse world
    this.matrix = mat4.create();
};

// Edge
var transform_value_support = CSS.supports("transform: translateZ(calc(100px * var(--mult-value,1)))");

var RootObject = function (_Group) {
    inherits(RootObject, _Group);

    function RootObject() {
        classCallCheck(this, RootObject);

        var _this = possibleConstructorReturn(this, (RootObject.__proto__ || Object.getPrototypeOf(RootObject)).call(this));

        RootObject.getClass().attach(_this.domElement);
        return _this;
    }

    createClass(RootObject, [{
        key: 'updateMatrix',
        value: function updateMatrix(camera) {

            if (camera instanceof PerspectiveCamera) {
                var p_coeff = camera.perspective_coefficient;
                var pshift = void 0;

                if (transform_value_support) {
                    pshift = 'calc( ' + p_coeff + ' * var(--viewport-height) / 2 )';
                } else {
                    pshift = p_coeff * this.domElement.parentNode.offsetHeight / 2 + "px";
                }

                this.domElement.style.transform = 'translateZ(' + pshift + ')scaleY(-1)matrix3d(' + camera.matrix.join() + ')matrix3d(' + this.matrix.join() + ')';
            } else if (camera instanceof OrthographicCamera) {

                var xsize = camera.right - camera.left;
                var ysize = camera.top - camera.bottom;

                var xcenter = (camera.right + camera.left) / 2;
                var ycenter = (camera.top + camera.bottom) / 2;

                var pwidth = this.domElement.parentNode.offsetWidth;
                var pheight = this.domElement.parentNode.offsetHeight;

                this.domElement.style.transform = 'scale(' + [pwidth / xsize, pheight / ysize].join() + ')translate(' + -xcenter + ',' + -ycenter + ')scaleY(-1)matrix3d(' + camera.matrix.join() + ')matrix3d(' + this.matrix.join() + ')';
            }
        }
    }], [{
        key: 'getClass',
        value: function getClass() {

            if (!css_class$2) {
                css_class$2 = new CSSClass();
                css_class$2.setProperties({
                    "width": "100% !important",
                    "height": "100% !important",

                    "top": "50%",
                    "left": "50%",

                    /* Click trough */
                    "pointer-events": "none",

                    /* Prefix still needed for Safari? */
                    "-webkit-backface-visibility": "hidden !important",
                    "backface-visibility": "hidden !important"
                });
                css_class$2.update();
                css_class$2.init();
            }

            return css_class$2;
        }
    }]);
    return RootObject;
}(Group);

var css_class$2 = null;

// Firefox mobile (Android)
var perspective_calc_support = CSS.supports('perspective: calc( 512px * 2 )');

var Container = function () {
    function Container() {
        classCallCheck(this, Container);


        this.camera = new PerspectiveCamera();
        this.root = null;

        this.domElement = document.createElement('div');
        Container.getClass().attach(this.domElement);

        this.width = 0;
        this.height = 0;

        this.addRoot(new RootObject());
    }

    // Needs to be called on camera change and if the root was replaced


    createClass(Container, [{
        key: 'updateCamera',
        value: function updateCamera() {

            if (this.camera instanceof PerspectiveCamera) {

                if (perspective_calc_support) {
                    this.domElement.style.setProperty("perspective", "calc( " + this.camera.perspective_coefficient + " * var(--viewport-height) / 2 )");
                } else {
                    this.domElement.style.setProperty("perspective", this.camera.perspective_coefficient * this.domElement.offsetHeight / 2 + "px");
                }
            } else if (this.camera instanceof OrthographicCamera) {

                this.domElement.style.removeProperty("perspective");
            }

            this.root.updateMatrix(this.camera);
        }
    }, {
        key: 'addRoot',
        value: function addRoot(root) {

            if (this.root) {
                this.domElement.removeChild(root.domElement);
            }

            this.root = root;
            this.domElement.appendChild(root.domElement);

            this.updateCamera();
        }
    }, {
        key: 'setSize',
        value: function setSize(width, height) {

            if (this.width == width && this.height == height) {
                return;
            }

            this.width = width;
            this.height = height;

            this.domElement.style.setProperty("--viewport-width", width + "px");
            this.domElement.style.setProperty("--viewport-height", height + "px");
        }
    }, {
        key: 'resetSize',
        value: function resetSize() {
            this.domElement.style.removeProperty("--viewport-width", width + "px");
            this.domElement.style.removeProperty("--viewport-height", height + "px");
        }
    }], [{
        key: 'getClass',
        value: function getClass() {

            if (!css_class$3) {

                css_class$3 = new CSSClass();
                css_class$3.setProperties({
                    "overflow": "hidden",

                    "position": "relative",

                    "--viewport-width": "100vw",
                    "--viewport-height": "100vh",

                    "width": "var(--viewport-width)",
                    "height": "var(--viewport-height)"

                });
                css_class$3.update();
                css_class$3.init();
            }

            return css_class$3;
        }
    }]);
    return Container;
}();

var css_class$3 = null;

var CustomElement = function (_Object3D) {
    inherits(CustomElement, _Object3D);

    function CustomElement(element) {
        classCallCheck(this, CustomElement);

        var _this = possibleConstructorReturn(this, (CustomElement.__proto__ || Object.getPrototypeOf(CustomElement)).call(this));

        _this.element = element;
        _this.domElement.appendChild(element);

        _this.elementScale = vec2.fromValues(1, 1);
        _this.elementCenter = vec2.fromValues(.5, .5);
        _this.elementRotation = 0;

        Group.getClass().attach(_this.domElement);
        CustomElement.getContentClass().attach(_this.element);

        _this.updateElementTransform();

        return _this;
    }

    createClass(CustomElement, [{
        key: 'setSize',
        value: function setSize(width, height) {
            this.element.style.width = width + "px";
            this.element.style.height = height + "px";
        }
    }, {
        key: 'setScale',
        value: function setScale(scale_x, scale_y) {
            this.elementScale = vec2.fromValues(scale_x, scale_y);
            this.updateElementTransform();
        }
    }, {
        key: 'setCenter',
        value: function setCenter(center_x, center_y) {
            this.elementCenter = vec2.fromValues(center_x, center_y);
            this.updateElementTransform();
        }
    }, {
        key: 'updateElementTransform',
        value: function updateElementTransform() {

            var pre_translate = "translate(-50%,-50%)";
            var scale = "scale(" + this.elementScale[0] + "," + -this.elementScale[1] + ")";
            var translate = "translate(" + (0.5 - this.elementCenter[0]) * 100 + "%," + (this.elementCenter[1] - 0.5) * 100 + "%)";

            var rotate = this.elementRotation == 0 ? "" : "rotate(" + this.elementRotation + "rad)";

            this.element.style.transform = pre_translate + scale + translate + rotate;
        }
    }, {
        key: 'enablePointer',
        value: function enablePointer() {
            this.element.style.pointerEvents = "auto";
        }
    }, {
        key: 'disablePointer',
        value: function disablePointer() {
            this.element.style.pointerEvents = "";
        }
    }], [{
        key: 'getContentClass',
        value: function getContentClass() {

            if (!css_content_class$1) {

                css_content_class$1 = new CSSClass();
                css_content_class$1.setProperties({

                    "background-color": "var(--background-color, transparent)",
                    "background-image": "var(--background-image, white)",
                    "background-size": "100% 100%",

                    "opacity": "var(--opacity, 1)"

                });
                css_content_class$1.update();
                css_content_class$1.init();
            }

            return css_content_class$1;
        }
    }]);
    return CustomElement;
}(Object3D);

var css_content_class$1 = null;

var Vertex = function Vertex(position, uv) {
    classCallCheck(this, Vertex);

    this.position = position ? position : vec3.create();
    this.uv = uv ? uv : vec2.create();
};

export { CSSClass, Material, Object3D, Group, RootObject, Container, Polygon, CustomElement, Triangle, Vertex, PerspectiveCamera, OrthographicCamera };
