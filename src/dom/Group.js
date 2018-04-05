
import { CSSClass } from '../css/CSSClass.js';

import { Triangle } from '../math/Triangle.js';

import { Object3D } from './Object3D.js';
import { Polygon } from './Polygon.js';

export class Group extends Object3D {
    
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
            
            let same_plane = vec3.equals(this.norm_cache, norm);
            
            // Check if they are on the same plane
            if(same_plane) {
                
                // Check if the two polygon shares an edge
                let shares_edge = false;
                for(let i=0; i<this.vert_cache.length; i++) {
                    
                    let c_vert = this.vert_cache[i];
                    
                    for(let j=0; j<vertices.length; j++) {
                        
                        let vert = vertices[j];
                        
                        // First we compare single points
                        if(vec2.equals(c_vert.uv, vert.uv) && vec3.equals(c_vert.position, vert.position)) {
                            
                            let c_vert_next = this.vert_cache[(i+1)%this.vert_cache.length];
                            let vert_prev = vertices[(j+vertices.length-1)%vertices.length];
                            
                            // If we find the same point in both of them, then compare the other vertex on the edge
                            if(vec2.equals(c_vert_next.uv, vert_prev.uv) && vec3.equals(c_vert_next.position, vert_prev.position)) {
                                
                                // Merge polygons
                                let start = this.vert_cache.slice(0,i+1);
                                let end = this.vert_cache.slice(i+1);
                                
                                let ins = [];
                                for(var k=1; k<(vertices.length-1);k++) {
                                    ins.push(vertices[ (j+k)%vertices.length ]);
                                }
                                
                                // Compare texture coords
                                if(!ins.every(v => {
                                    
                                    let uv = vec3.transformMat4(vec3.create(), v.position, this.vec2tex).slice(0,2);
                                    
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
                vec3.fromValues(this.vert_cache[0].uv[0], this.vert_cache[0].uv[1], 0),
                vec3.fromValues(this.vert_cache[1].uv[0], this.vert_cache[1].uv[1], 0),
                vec3.fromValues(this.vert_cache[2].uv[0], this.vert_cache[2].uv[1], 0)
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
        
        if(!css_class) {
            css_class = new CSSClass();
            css_class.setProperties({
                /* Center element */
                "width": "0px",
                "height": "0px",

                "transform-style": "preserve-3d",
                "overflow": "visible"
            });
            css_class.setProperties(Object3D.getCommonAttributes());
            css_class.update();
            css_class.init();
        }
        
        return css_class;

    }
    
}

var css_class = null;