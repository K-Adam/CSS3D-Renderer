/**
 * @license C3R
 * The MIT License
 *
 * Copyright © 2020 Adam Kecskes
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
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('gl-matrix')) :
    typeof define === 'function' && define.amd ? define(['exports', 'gl-matrix'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.C3R = {}, global.glMatrix));
})(this, (function (exports, glMatrix) { 'use strict';

    class CSSClass {
        
        constructor() {
            
            this.class_name = "c3r-"+(CSSClass.id_counter++);
            
            this.properties = new Map();
            
            this.domElement = document.createElement("style");
            
        }
        
        init() {
            document.head.appendChild(this.domElement);
        }
        
        unload() {
            document.head.removeChild(this.domElement);
        }
        
        attach(elem) {
            elem.classList.add(this.class_name);
        }
        
        detach(elem) {
            elem.classList.remove(this.class_name);
        }
        
        setProperty(prop, val) {
            this.properties.set(prop, val);
        }
        
        setProperties(props) {
            for(let i in props) {
                this.setProperty(i, props[i]);
            }
        }
        
        update() {
            
            this.domElement.innerHTML = '.'+this.class_name+'{'+
                Array.from(
                    this.properties.entries()
                ).map(
                    kv => kv.join(':')
                ).join(';')
            +'}';
            
        }
        
        clone() {
            
            var cl = new CSSClass();
            cl.properties = new Map(this.properties);
            return cl;
            
        }
        
    }

    CSSClass.id_counter = 0;

    class Material {
        
        constructor() {
            
            this.backgroundImageSrc = null;
            this.backgroundColor = null; // vec4 0-1
            this.opacity = 1.0;
            
        }
        
        apply(elem) {
            
            if(this.backgroundImageSrc) {
                elem.style.setProperty("--background-image", "url('" + this.backgroundImageSrc + "')");
            } else {
                elem.style.removeProperty("--background-image");
            }
            
            if(this.backgroundColor) {
                elem.style.setProperty("--background-color", "rgba(" + [
                    Math.round(this.backgroundColor[0]*255),
                    Math.round(this.backgroundColor[1]*255),
                    Math.round(this.backgroundColor[2]*255),
                    this.backgroundColor[3]
                ].join() + ")");
            } else {
                elem.style.removeProperty("--background-color");
            }
            
            if(this.opacity == 1.0) {
                elem.style.removeProperty("--opacity");
            } else {
                elem.style.setProperty("--opacity", this.opacity);
            }
            
        }
        
    }

    class Object3D {
        
        constructor() {
            
            this.matrix = glMatrix.mat4.create();
            
            this.domElement = document.createElement('div');
            
            this.material = null;
            
        }
        
        // set transform property 
        updateMatrix() {
            this.domElement.style.transform = 'matrix3d('+this.matrix.join()+')';
        }
        
        clearMatrix() {
            this.matrix = glMatrix.mat4.create();
            this.domElement.style.transform = "";
        }
        
        updateMaterial() {
            if(this.material) {
                this.material.apply(this.domElement);
            }
        }
        
        // Used in Group and Polygon
        static getCommonAttributes() {
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
                "backface-visibility": "inherit",
            };
        }
        
    }

    // 3D triangle, represented by 3 points
    class Triangle {
        
        constructor(p1, p2, p3, norm) {
            this.p1 = p1;
            this.p2 = p2;
            this.p3 = p3;
            
            this.edges = null;
            
            this.norm = norm ? norm : this.calculateNormal();
        }
        
        updateEdges() {
            
            if(this.edges) return;
            
            this.edges = [
                glMatrix.vec3.sub(glMatrix.vec3.create(), this.p1, this.p2),
                glMatrix.vec3.sub(glMatrix.vec3.create(), this.p2, this.p3),
                glMatrix.vec3.sub(glMatrix.vec3.create(), this.p3, this.p1)
            ];
        }
        
        calculateNormal() {
            
            this.updateEdges();
            
            return glMatrix.vec3.normalize(glMatrix.vec3.create(), glMatrix.vec3.cross(
                glMatrix.vec3.create(), this.edges[0], this.edges[1]
            ));
            
        }
        
        calculateEdgeLengths() {
            return glMatrix.vec3.fromValues(
                glMatrix.vec3.len(this.edges[0]),
                glMatrix.vec3.len(this.edges[1]),
                glMatrix.vec3.len(this.edges[2])
            );
        }
        
        getTransformationTo(that) {
            
            let A = glMatrix.mat4.fromValues(
                this.p1[0],   this.p1[1],   this.p1[2],   1,
                this.p2[0],   this.p2[1],   this.p2[2],   1,
                this.p3[0],   this.p3[1],   this.p3[2],   1,
                this.norm[0], this.norm[1], this.norm[2], 0
            );
            
            let B = glMatrix.mat4.fromValues(
                that.p1[0],   that.p1[1],   that.p1[2],   1,
                that.p2[0],   that.p2[1],   that.p2[2],   1,
                that.p3[0],   that.p3[1],   that.p3[2],   1,
                that.norm[0], that.norm[1], that.norm[2], 0
            );
            
            return glMatrix.mat4.mul(
                glMatrix.mat4.create(),
                B,
                glMatrix.mat4.invert(
                    glMatrix.mat4.create(),
                    A
                )
            );
            
        }
        
    }

    var css_clip_path = CSS.supports("clip-path: polygon(50% 0%, 0% 100%, 100% 100%)");
    var css_webkit_clip_path = CSS.supports("-webkit-clip-path: polygon(50% 0%, 0% 100%, 100% 100%)");

    // Avoid scaling issues. If the content element is initially too small, the result will be blurry
    var default_dom_size = (num) => Math.max(250, Math.min(num, 1200));

    var cross2 = function(a, b, o) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    };

    class Polygon extends Object3D {
        
        constructor(vertices, contentElement=null) {
            
            super();
            
            this.vertices = vertices; // vertices in CCW
            this.clipPath = []; // path of the polygon on a rectangular element
            
            this.simplify();
            
            Polygon.getClass().attach(this.domElement);
            
            // Base size of the dom element ( in case of a triangle, it will be the length of the longest side)
            this.getDomSize = default_dom_size;
            
            // Actual size of the dom element
            this.block_width = 0;
            this.block_height = 0;
            
            // texture / element / etc
            this.contentElement = contentElement ? contentElement : document.createElement('div');
            Polygon.getContentClass().attach(this.contentElement);
            this.domElement.appendChild(this.contentElement);
            
            this.uv_scale = glMatrix.vec2.fromValues(1,1);
            this.uv_offset = glMatrix.vec2.fromValues(0,0);
            
            // triangle only data
            this.maxi = 0;// Index of the longest side
            
        }
        
        // remove redundant vertices ( which are on the same line )
        simplify() {
            var vertices = [this.vertices[0]];
            
            for(let i=1; i<this.vertices.length; i++) {
                
                let prev_i = i-1;
                let next_i = (i+1)%this.vertices.length;
                
                let p1 = this.vertices[prev_i].position;
                let p2 = this.vertices[i].position;
                let p3 = this.vertices[next_i].position;
                
                let e1 = glMatrix.vec3.sub(glMatrix.vec3.create(), p1, p2);
                let e2 = glMatrix.vec3.sub(glMatrix.vec3.create(), p2, p3);
                
                glMatrix.vec3.normalize(e1, e1);
                glMatrix.vec3.normalize(e2, e2);
                
                // Not collinear
                if(Math.abs(glMatrix.vec3.dot(e1, e2)) < 0.9999 ) {
                    vertices.push(this.vertices[i]);
                }
                
            }
            
            this.vertices = vertices;
            
        }
        
        updateMatrix() {
            
            // The first three polygon points should be transformed to this positions
            let tri = new Triangle(
                this.vertices[0].position,
                this.vertices[1].position,
                this.vertices[2].position
            );
            
            // Faster method for triangles
            if(this.vertices.length == 3) {
                
                // The longest side will be the base
                let ln = tri.calculateEdgeLengths();
                
                this.maxi = ln.indexOf(Math.max(...ln));
                
                
                let ai = this.maxi;
                let bi = (this.maxi+1)%3;
                let ci = (this.maxi+2)%3;
                
                let a = ln[ai];
                let b = ln[bi];
                let c = ln[ci];
                
                let Ax = - (b*b - c*c - a*a) / (2*a);
                let Ay = Math.sqrt(c*c - Ax*Ax);
                
                // Where the longest side is split into two by the height-line
                let base_split = Ax/a;
                
                // scale the element, to avoid blurry texture
                
                let scale_ratio = this.getDomSize(a) / a;
                
                this.block_width = a * scale_ratio;
                this.block_height = Ay * scale_ratio;
                //
                
                this.clipPath = [
                    glMatrix.vec2.fromValues(0,0),
                    glMatrix.vec2.fromValues(1,0),
                    glMatrix.vec2.fromValues(base_split,1)
                ];
                
                let tri_v = [
                    glMatrix.vec3.fromValues(0,0,0),
                    glMatrix.vec3.fromValues(this.block_width,0,0),
                    glMatrix.vec3.fromValues(Ax * scale_ratio,this.block_height,0)
                ];
                
                this.matrix = new Triangle(
                    tri_v[ai],
                    tri_v[bi],
                    tri_v[ci],
                    
                    [0,0,1]
                ).getTransformationTo(tri);

            } else if(this.vertices.length > 3) {
                
                //////////////////////////////////////////////
                // Project polygon points to the 2D plane
                //////////////////////////////////////////////
                
                // get new bases
                let b1 = tri.norm;
                let b2 = (Math.abs(glMatrix.vec3.dot(b1, [0,0,1])) < 0.9) ? glMatrix.vec3.cross(glMatrix.vec3.create(), b1, [0,0,1]) : glMatrix.vec3.cross(glMatrix.vec3.create(), b1, [0,1,0]);
                let b3 = glMatrix.vec3.cross(glMatrix.vec3.create(), b2, b1);
                
                // Base change matrices
                let BT = glMatrix.mat3.fromValues(
                    b2[0], b2[1], b2[2],
                    b3[0], b3[1], b3[2],
                    b1[0], b1[1], b1[2]
                );
                
                let BTI = glMatrix.mat3.invert(glMatrix.mat3.create(), BT);
                
                if(BTI === null) {
                    throw new Error("Degenerate triangle?");
                }
                
                // Transform points with the matrices
                let points2d = this.vertices.map(
                    v => {
                        let pp = glMatrix.vec3.transformMat3(glMatrix.vec3.create(), v.position, BTI);
                        return pp.slice(0, 2);
                    }
                );
                
                //////////////////////////////////////////////
                // Find convex hull
                //////////////////////////////////////////////
                
                // https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain
                
                let points = points2d.slice().sort(function(a, b) {
                    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
                });
                
                let lower = [];
                for (let i = 0; i < points.length; i++) {
                    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
                        lower.pop();
                    }
                    lower.push(points[i]);
                }

                let upper = [];
                for (let i = points.length - 1; i >= 0; i--) {
                    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
                        upper.pop();
                    }
                    upper.push(points[i]);
                }

                upper.pop();
                lower.pop();
                
                let hull = lower.concat(upper);
                
                //////////////////////////////////////////////
                // Find bounding box
                //////////////////////////////////////////////
                
                // For each edge (of the hull), transform the points to make it axis aligned
                // Find the AABB with the smallest area
                
                let min_area = Number.POSITIVE_INFINITY;
                //let corners = [];
                let min_bounds = [];
                let min_TI = glMatrix.mat2.create();
                
                for(var i=0; i<hull.length; i++) {
                    
                    let side = glMatrix.vec2.sub(glMatrix.vec2.create(), hull[i], hull[(i+1)%hull.length]);
                    glMatrix.vec2.normalize(side, side);
                    
                    let AT = glMatrix.mat2.fromValues(
                        side[0], side[1],
                        side[1],-side[0]
                    );
                    let ATI = glMatrix.mat2.invert(glMatrix.mat2.create(), AT);
                    
                    let tpoints = hull.map(
                        p => glMatrix.vec2.transformMat2(glMatrix.vec2.create(), p, ATI)
                    );
                    
                    // [xmin, xmax, ymin, ymax]
                    let bounds = tpoints.map(
                        p => [p[0],p[0],p[1],p[1]]
                    ).reduce(
                        (a, b) => [
                            Math.min(a[0],b[0]),
                            Math.max(a[1],b[1]),
                            Math.min(a[2],b[2]),
                            Math.max(a[3],b[3])
                        ]
                    );
                    
                    let area = (bounds[1]-bounds[0])*(bounds[3]-bounds[2]);
                    if(area < min_area) {
                        min_area = area;
                        
                        min_bounds = bounds;
                        min_TI = ATI;
                        
                    }
                
                }
                
                //
                
                let box_width = min_bounds[1]-min_bounds[0];
                let box_height = min_bounds[3]-min_bounds[2];
                
                let scale_ratio;
                
                // scale the element, to avoid blurry texture
                if(box_width > box_height) {
                    scale_ratio = this.getDomSize(box_width) / box_width;
                } else {
                    scale_ratio = this.getDomSize(box_height) / box_height;
                }
                    
                this.block_width = box_width*scale_ratio;
                this.block_height = box_height*scale_ratio;
                
                
                let clipPoints = points2d.map(
                    p => glMatrix.vec2.sub(
                        glMatrix.vec2.create(),
                        glMatrix.vec2.transformMat2(glMatrix.vec2.create(), p, min_TI),
                        [min_bounds[0], min_bounds[2]]
                    )
                );
                
                this.clipPath = clipPoints.map(
                    p2 => glMatrix.vec2.fromValues(p2[0]/box_width, p2[1]/box_height)
                );
                
                this.matrix = new Triangle(
                    glMatrix.vec3.fromValues(clipPoints[0][0]*scale_ratio, clipPoints[0][1]*scale_ratio, 0),
                    glMatrix.vec3.fromValues(clipPoints[1][0]*scale_ratio, clipPoints[1][1]*scale_ratio, 0),
                    glMatrix.vec3.fromValues(clipPoints[2][0]*scale_ratio, clipPoints[2][1]*scale_ratio, 0)
                ).getTransformationTo(tri);
                
                
            } else {
                
                throw new Error("The polygon has not enough sides");
                
            }
            
            let clipData = 'polygon('+this.clipPath.map(p=>(p[0]*100)+'% '+(p[1]*100)+'%').join()+')';
            if(css_clip_path) {
                this.domElement.style.clipPath = clipData;
            } else if(css_webkit_clip_path) {
                this.domElement.style['-webkit-clip-path'] = clipData;
            }
            
            //this.domElement.style.width = this.block_width+"px";
            //this.domElement.style.height = this.block_height+"px";
            
            // We need the width/height information in the childNode to properly position and scale the texture
            // If we use width/height CSS values, then we can rescale this element, without calling updateContent
            
            this.domElement.style.setProperty("--width", this.block_width+"px");
            this.domElement.style.setProperty("--height", this.block_height+"px");
            
            super.updateMatrix();
            
        }
        
        updateContent() {
            
            // uv_scale
            let uvs = this.vertices.map(v => {
                let ret = glMatrix.vec2.mul(glMatrix.vec2.create(),v.uv,this.uv_scale);
                glMatrix.vec2.add(ret, ret, this.uv_offset);
                return ret;
            });
            
            // handle texture repeat
            let tex_bounds = uvs.map(
                // [xmin, xmax, ymin, ymax]
                uv => [uv[0],uv[0],uv[1],uv[1]]
            ).reduce(
                (a, b) => [
                    Math.min(a[0],b[0]),
                    Math.max(a[1],b[1]),
                    Math.min(a[2],b[2]),
                    Math.max(a[3],b[3])
                ]
            );
            
            let txmin = tex_bounds[0];
            let txmax = tex_bounds[1];
            let tymin = tex_bounds[2];
            let tymax = tex_bounds[3];
            
            let xsize = txmax - txmin;
            let ysize = tymax - tymin;
            
            let scx = 1/xsize,
                scy = 1/ysize;
            
            
            this.contentElement.style.backgroundPosition = 'calc(var(--width) * '+(-txmin*scx)+') calc(var(--height) * '+(1+tymin*scy)+')';
            this.contentElement.style.backgroundSize = (100*scx) + '% ' + (100*scy) + '%';
            
            let TA = glMatrix.mat3.fromValues(
                (uvs[0][0]-txmin)/xsize, 1-(uvs[0][1]-tymin)/ysize, 1,
                (uvs[1][0]-txmin)/xsize, 1-(uvs[1][1]-tymin)/ysize, 1,
                (uvs[2][0]-txmin)/xsize, 1-(uvs[2][1]-tymin)/ysize, 1
            );
            
            let ai, bi, ci;
            // use the longest side as base if it is a triangle
            if(this.vertices.length == 3) {
                ai = this.maxi;
                bi = (this.maxi+1)%3;
                ci = (this.maxi+2)%3;
            } else {
                ai = 0;
                bi = 1;
                ci = 2;
            }
            
            let TB = glMatrix.mat3.fromValues(
                this.clipPath[ai][0], this.clipPath[ai][1], 1,
                this.clipPath[bi][0], this.clipPath[bi][1], 1,
                this.clipPath[ci][0], this.clipPath[ci][1], 1
            );
            
            let TX = glMatrix.mat3.mul(
                glMatrix.mat3.create(),
                TB,
                glMatrix.mat3.invert(
                    glMatrix.mat3.create(),
                    TA
                )
            );
            
            let bh = this.block_height/this.block_width;
            this.contentElement.style.transform = "translate("+[
                (TX[6] * 100)+"%",
                (TX[7] * 100)+"%"
            ].join()+")"+"matrix("+[
                TX[0], TX[1]*bh,
                TX[3]/bh, TX[4],
                0,0
            ].join()+")";
            
        }
        
        
        
        static getClass() {
            
            if(!css_class$3) {
                css_class$3 = new CSSClass();
                css_class$3.setProperties({
                    "width": "var(--width, 0px)",
                    "height": "var(--height, 0px)",
                    
                    "opacity": "var(--opacity, 1)",
                    
                    "transform-style": "flat",
                    "overflow": "hidden"
                });
                css_class$3.setProperties(Object3D.getCommonAttributes());
                css_class$3.update();
                css_class$3.init();
            }
            
            return css_class$3;

        }
        
        static getContentClass() {
            
            if(!css_content_class$1) {
                
                css_content_class$1 = new CSSClass();
                css_content_class$1.setProperties({
                    "width": "100%",
                    "height": "100%",
                    
                    "background-color": "var(--background-color, white)",
                    "background-image": "var(--background-image, none)",
                    "background-size": "100% 100%",
                    
                    "background-blend-mode": "multiply",
                    
                    "transform": "matrix(1, 0, 0, 1, 0, 0)",
                    "transform-origin": "0 0"
                });
                
                
                css_content_class$1.update();
                css_content_class$1.init();
                
            }
            
            return css_content_class$1;
            
        }
        
        
    }

    var css_class$3 = null;
    var css_content_class$1 = null;

    class Group extends Object3D {
        
        constructor() {
            
            super();
            
            Group.getClass().attach(this.domElement);
            
            this.children = [];
            
            //
            this.vert_cache = null;
            this.norm_cache = null;
            this.vec2tex = null;
            
        }
        
        addChild(obj) {
            
            this.children.push(obj);
            this.domElement.appendChild(obj.domElement);
            
        }
        
        removeChild(obj) {
            
            let index = this.children.indexOf(obj);
            
            if(index > -1) {
                this.removeChildIndex(index);
            }
            
        }
        
        removeChildIndex(index) {
            
            var obj = this.children[index];
            
            this.children.splice(index, 1);
            this.domElement.removeChild(obj.domElement);
            
        }
        
        clear() {
            
            var i = this.children.length;
            while( i --> 0 ) {
                this.removeChildIndex(i);
            }
            
        }
        
        // 
        addPolygon(vertices, element=null) {
            
            let poly = new Polygon(vertices, element);
            
            poly.updateMatrix();
            poly.updateContent();
            
            this.addChild(poly);
            
            return poly;
            
        }
        
        // Adding triangles with this method makes it possible to reconstruct polygons (like quads)
        // The polygon (defined by vertices) will be added at last when flushPolygons() is called
        pushPolygon(vertices) {
            
            // TODO: if vertices.length > 3, then we should compare more than 1 edge
            
            // Calculate the normal from vertices
            let norm = (new Triangle(
                vertices[0].position,
                vertices[1].position,
                vertices[2].position
            )).norm;
            
            // If there is already a polygon in the cache, compare the current vertices with it
            if(this.vert_cache) {
                
                let same_plane = glMatrix.vec3.equals(this.norm_cache, norm);
                
                // Check if they are on the same plane
                if(same_plane) {
                    
                    // Check if the two polygon shares an edge
                    let shares_edge = false;
                    for(let i=0; i<this.vert_cache.length; i++) {
                        
                        let c_vert = this.vert_cache[i];
                        
                        for(let j=0; j<vertices.length; j++) {
                            
                            let vert = vertices[j];
                            
                            // First we compare single points
                            if(glMatrix.vec2.equals(c_vert.uv, vert.uv) && glMatrix.vec3.equals(c_vert.position, vert.position)) {
                                
                                let c_vert_next = this.vert_cache[(i+1)%this.vert_cache.length];
                                let vert_prev = vertices[(j+vertices.length-1)%vertices.length];
                                
                                // If we find the same point in both of them, then compare the other vertex on the edge
                                if(glMatrix.vec2.equals(c_vert_next.uv, vert_prev.uv) && glMatrix.vec3.equals(c_vert_next.position, vert_prev.position)) {
                                    
                                    // Merge polygons
                                    let start = this.vert_cache.slice(0,i+1);
                                    let end = this.vert_cache.slice(i+1);
                                    
                                    let ins = [];
                                    for(var k=1; k<(vertices.length-1);k++) {
                                        ins.push(vertices[ (j+k)%vertices.length ]);
                                    }
                                    
                                    // Compare texture coords
                                    if(!ins.every(v => {
                                        
                                        let uv = glMatrix.vec3.transformMat4(glMatrix.vec3.create(), v.position, this.vec2tex).slice(0,2);
                                        
                                        return glMatrix.vec2.equals(uv, v.uv);
                                        
                                    })) {
                                        continue;
                                    }
                                    
                                    this.vert_cache = start.concat(ins, end);
                                    
                                    shares_edge = true;
                                    break;
                                    
                                }
                                
                            }
                            
                        }
                        
                        if(shares_edge) {
                            break;
                        }
                        
                    }
                    
                    if(!shares_edge) {
                        this.flushPolygons();
                    }
                    
                } else {
                    this.flushPolygons();
                }
            }
            
            // If it was empty or flushed, store verts in cache
            if(!this.vert_cache) {
                this.vert_cache = vertices;
                this.norm_cache = norm;
                
                this.vec2tex = (new Triangle(
                    vertices[0].position,
                    vertices[1].position,
                    vertices[2].position,
                    norm
                )).getTransformationTo(new Triangle(
                    glMatrix.vec3.fromValues(this.vert_cache[0].uv[0], this.vert_cache[0].uv[1], 0),
                    glMatrix.vec3.fromValues(this.vert_cache[1].uv[0], this.vert_cache[1].uv[1], 0),
                    glMatrix.vec3.fromValues(this.vert_cache[2].uv[0], this.vert_cache[2].uv[1], 0)
                ));
                
            }
            
        }
        
        flushPolygons() {
            
            if(this.vert_cache) {
                this.addPolygon(this.vert_cache);
                
                this.vert_cache = null;
                this.norm_cache = null;
                this.vec2tex = null;
            }
            
        }
        
        static getClass() {
            
            if(!css_class$2) {
                css_class$2 = new CSSClass();
                css_class$2.setProperties({
                    /* Center element */
                    "width": "0px",
                    "height": "0px",

                    "transform-style": "preserve-3d",
                    "overflow": "visible"
                });
                css_class$2.setProperties(Object3D.getCommonAttributes());
                css_class$2.update();
                css_class$2.init();
            }
            
            return css_class$2;

        }
        
    }

    var css_class$2 = null;

    class PerspectiveCamera {
        
        constructor(fov = 70) {
            
            this.fov = fov;
            
            // Inverse world
            this.matrix = glMatrix.mat4.create();
            
        }
        
        get perspective_coefficient() {
            return 1.0 / Math.tan(this.fov * Math.PI / 360);
        }
        
    }

    class OrthographicCamera {
        
        constructor(left, right, top, bottom) {
            
            this.left = left;
            this.right = right;
            this.top = top;
            this.bottom = bottom;
            
            // Inverse world
            this.matrix = glMatrix.mat4.create();
            
        }
        
    }

    // Edge
    var transform_value_support = CSS.supports("transform: translateZ(calc(100px * var(--mult-value,1)))");

    class RootObject extends Group {
        
        constructor() {
            
            super();
            
            RootObject.getClass().attach(this.domElement);
        }
        
        updateMatrix(camera) {
            
            if(camera instanceof PerspectiveCamera) {
                let p_coeff = camera.perspective_coefficient;
                let pshift;

                if(transform_value_support) {
                    pshift = 'calc( '+p_coeff+' * var(--viewport-height) / 2 )';
                } else {
                    pshift = (p_coeff * this.domElement.parentNode.offsetHeight / 2) + "px";
                }
                
                this.domElement.style.transform = 'translateZ('+pshift+')scaleY(-1)matrix3d('+camera.matrix.join() + ')matrix3d(' + this.matrix.join() + ')';
            } else if(camera instanceof OrthographicCamera) {
                
                let xsize = camera.right - camera.left;
                let ysize = camera.top - camera.bottom;
                
                let xcenter = (camera.right + camera.left)/2;
                let ycenter = (camera.top + camera.bottom)/2;
                
                let pwidth = this.domElement.parentNode.offsetWidth;
                let pheight = this.domElement.parentNode.offsetHeight;
                
                this.domElement.style.transform = 'scale('+[pwidth/xsize,pheight/ysize].join()+')translate('+(-xcenter)+','+(-ycenter)+')scaleY(-1)matrix3d('+camera.matrix.join() + ')matrix3d(' + this.matrix.join() + ')';
                
            }
            
        }
        
        static getClass() {
            
            if(!css_class$1) {
                css_class$1 = new CSSClass();
                css_class$1.setProperties({
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
                css_class$1.update();
                css_class$1.init();
            }

            return css_class$1;
        }
        
    }

    var css_class$1 = null;

    // Firefox mobile (Android)
    var perspective_calc_support = CSS.supports('perspective: calc( 512px * 2 )');

    class Container {
        
        constructor() {
            
            this.camera = new PerspectiveCamera();
            this.root = null;
            
            this.domElement = document.createElement('div');
            Container.getClass().attach(this.domElement);
            
            this.width = 0;
            this.height = 0;
            
            this.addRoot(new RootObject());
            
        }
        
        // Needs to be called on camera change and if the root was replaced
        updateCamera() {
            
            if(this.camera instanceof PerspectiveCamera) {
                
                if(perspective_calc_support) {
                    this.domElement.style.setProperty("perspective", "calc( "+this.camera.perspective_coefficient+" * var(--viewport-height) / 2 )");
                } else {
                    this.domElement.style.setProperty("perspective", (this.camera.perspective_coefficient * this.domElement.offsetHeight / 2) + "px");
                }
                
            } else if(this.camera instanceof OrthographicCamera) {
                
                this.domElement.style.removeProperty("perspective");
                
            }
            
            this.root.updateMatrix(this.camera);
            
        }
        
        addRoot(root) {
            
            if(this.root) {
                this.domElement.removeChild(root.domElement);
            }
            
            this.root = root;
            this.domElement.appendChild(root.domElement);
            
            this.updateCamera();
            
        }
        
        setSize(width, height) {
            
            if(this.width == width && this.height == height) {
                return;
            }
            
            this.width = width;
            this.height = height;
            
            this.domElement.style.setProperty("--viewport-width", width+"px");
            this.domElement.style.setProperty("--viewport-height", height+"px");
        }
        
        resetSize() {
            this.domElement.style.removeProperty("--viewport-width");
            this.domElement.style.removeProperty("--viewport-height");
        }
        
        static getClass() {
            
            if(!css_class) {
                
                css_class = new CSSClass();
                css_class.setProperties({
                    "overflow": "hidden",
                    
                    "position": "relative",
                    
                    "--viewport-width": "100vw",
                    "--viewport-height": "100vh",
                    
                    "width": "var(--viewport-width)",
                    "height": "var(--viewport-height)"
                    
                });
                css_class.update();
                css_class.init();
                
            }
            
            return css_class;
            
        }
        
    }

    var css_class = null;

    class CustomElement extends Object3D {
        
        constructor(element) {
            
            super();
            
            this.element = element;
            this.domElement.appendChild(element);
            
            this.elementScale = glMatrix.vec2.fromValues(1,1);
            this.elementCenter = glMatrix.vec2.fromValues(.5,.5);
            this.elementRotation = 0;
            
            Group.getClass().attach(this.domElement);
            CustomElement.getContentClass().attach(this.element);
            
            this.updateElementTransform();
            
        }
        
        setSize(width, height) {
            this.element.style.width = width+"px";
            this.element.style.height = height+"px";
        }
        
        setScale(scale_x, scale_y) {
            this.elementScale = glMatrix.vec2.fromValues(scale_x,scale_y);
            this.updateElementTransform();
        }
        
        setCenter(center_x, center_y) {
            this.elementCenter = glMatrix.vec2.fromValues(center_x,center_y);
            this.updateElementTransform();
        }
        
        updateElementTransform() {
            
            var pre_translate = "translate(-50%,-50%)";
            var scale = "scale("+(this.elementScale[0])+","+(-this.elementScale[1])+")";
            var translate = "translate("+((0.5-this.elementCenter[0])*100)+"%,"+((this.elementCenter[1]-0.5)*100)+"%)";
            
            var rotate = this.elementRotation == 0 ? "" : "rotate("+this.elementRotation+"rad)";
            
            this.element.style.transform = pre_translate+scale+translate+rotate;
        }
        
        enablePointer() {
            this.element.style.pointerEvents = "auto";
        }
        
        disablePointer() {
            this.element.style.pointerEvents = "";
        }
        
        static getContentClass() {
            
            if(!css_content_class) {
                
                css_content_class = new CSSClass();
                css_content_class.setProperties({
                    
                    "background-color": "var(--background-color, transparent)",
                    "background-image": "var(--background-image, white)",
                    "background-size": "100% 100%",
                    
                    "opacity": "var(--opacity, 1)"
                    
                });
                css_content_class.update();
                css_content_class.init();
                
            }
            
            return css_content_class;
            
        }
        
    }

    var css_content_class = null;

    class Vertex {
        
        constructor(position, uv) {
            this.position = position ? position : glMatrix.vec3.create();
            this.uv = uv ? uv : glMatrix.vec2.create();
        }
        
    }

    exports.CSSClass = CSSClass;
    exports.Container = Container;
    exports.CustomElement = CustomElement;
    exports.Group = Group;
    exports.Material = Material;
    exports.Object3D = Object3D;
    exports.OrthographicCamera = OrthographicCamera;
    exports.PerspectiveCamera = PerspectiveCamera;
    exports.Polygon = Polygon;
    exports.RootObject = RootObject;
    exports.Triangle = Triangle;
    exports.Vertex = Vertex;

}));
