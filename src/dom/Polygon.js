
import { CSSClass } from '../css/CSSClass.js';
import { Object3D } from './Object3D.js';
import { Triangle } from '../math/Triangle.js';

var isWebKit = 'WebkitAppearance' in document.documentElement.style;

var css_mask = CSS.supports("mask-image: var(--background-image, none)");
var css_webkit_mask = CSS.supports("-webkit-mask-image: var(--background-image, none)");

var css_clip_path = CSS.supports("clip-path: polygon(50% 0%, 0% 100%, 100% 100%)");
var css_webkit_clip_path = CSS.supports("-webkit-clip-path: polygon(50% 0%, 0% 100%, 100% 100%)");

// Avoid scaling issues. If the content element is initially too small, the result will be blurry
var default_dom_size = (num) => Math.max(250, Math.min(num, 1200));

var cross2 = function(a, b, o) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
};

export class Polygon extends Object3D {
    
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
        
        this.uv_scale = vec2.fromValues(1,1);
        this.uv_offset = vec2.fromValues(0,0);
        
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
            
            let e1 = vec3.sub(vec3.create(), p1, p2);
            let e2 = vec3.sub(vec3.create(), p2, p3);
            
            vec3.normalize(e1, e1);
            vec3.normalize(e2, e2);
            
            // Not collinear
            if(Math.abs(vec3.dot(e1, e2)) < 0.9999 ) {
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
                vec2.fromValues(0,0),
                vec2.fromValues(1,0),
                vec2.fromValues(base_split,1)
            ];
            
            let tri_v = [
                vec3.fromValues(0,0,0),
                vec3.fromValues(this.block_width,0,0),
                vec3.fromValues(Ax * scale_ratio,this.block_height,0)
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
            let b2 = (Math.abs(vec3.dot(b1, [0,0,1])) < 0.9) ? vec3.cross(vec3.create(), b1, [0,0,1]) : vec3.cross(vec3.create(), b1, [0,1,0]);
            let b3 = vec3.cross(vec3.create(), b2, b1);
            
            // Base change matrices
            let BT = mat3.fromValues(
                b2[0], b2[1], b2[2],
                b3[0], b3[1], b3[2],
                b1[0], b1[1], b1[2]
            );
            
            let BTI = mat3.invert(mat3.create(), BT);
            
            if(BTI === null) {
                throw new Error("Degenerate triangle?");
            }
            
            // Transform points with the matrices
            let points2d = this.vertices.map(
                v => {
                    let pp = vec3.transformMat3(vec3.create(), v.position, BTI);
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
            let min_T = mat2.create();
            let min_TI = mat2.create();
            
            for(var i=0; i<hull.length; i++) {
                
                let side = vec2.sub(vec2.create(), hull[i], hull[(i+1)%hull.length]);
                vec2.normalize(side, side);
                
                let AT = mat2.fromValues(
                    side[0], side[1],
                    side[1],-side[0]
                );
                let ATI = mat2.invert(mat2.create(), AT);
                
                let tpoints = hull.map(
                    p => vec2.transformMat2(vec2.create(), p, ATI)
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
            
            let scale_ratio = 1;
            
            // scale the element, to avoid blurry texture
            if(box_width > box_height) {
                scale_ratio = this.getDomSize(box_width) / box_width;
            } else {
                scale_ratio = this.getDomSize(box_height) / box_height;
            }
                
            this.block_width = box_width*scale_ratio;
            this.block_height = box_height*scale_ratio;
            
            
            let clipPoints = points2d.map(
                p => vec2.sub(
                    vec2.create(),
                    vec2.transformMat2(vec2.create(), p, min_TI),
                    [min_bounds[0], min_bounds[2]]
                )
            );
            
            this.clipPath = clipPoints.map(
                p2 => vec2.fromValues(p2[0]/box_width, p2[1]/box_height)
            );
            
            this.matrix = new Triangle(
                vec3.fromValues(clipPoints[0][0]*scale_ratio, clipPoints[0][1]*scale_ratio, 0),
                vec3.fromValues(clipPoints[1][0]*scale_ratio, clipPoints[1][1]*scale_ratio, 0),
                vec3.fromValues(clipPoints[2][0]*scale_ratio, clipPoints[2][1]*scale_ratio, 0)
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
            let ret = vec2.mul(vec2.create(),v.uv,this.uv_scale);
            vec2.add(ret, ret, this.uv_offset);
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
        
        let TA = mat3.fromValues(
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
        
        let TB = mat3.fromValues(
            this.clipPath[ai][0], this.clipPath[ai][1], 1,
            this.clipPath[bi][0], this.clipPath[bi][1], 1,
            this.clipPath[ci][0], this.clipPath[ci][1], 1
        );
        
        let TX = mat3.mul(
            mat3.create(),
            TB,
            mat3.invert(
                mat3.create(),
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
        
        if(!css_class) {
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
    
    static getContentClass() {
        
        if(!css_content_class) {
            
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
    
    
}

var css_class = null;
var css_content_class = null;
