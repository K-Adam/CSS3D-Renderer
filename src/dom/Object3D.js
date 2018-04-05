
import { CSSClass } from '../css/CSSClass.js';
import { Material } from '../css/Material.js';

export class Object3D {
    
    constructor() {
        
        this.matrix = mat4.create();
        
        this.domElement = document.createElement('div');
        
        this.material = null;
        
    }
    
    // set transform property 
    updateMatrix() {
        this.domElement.style.transform = 'matrix3d('+this.matrix.join()+')';
    }
    
    clearMatrix() {
        this.matrix = mat4.create();
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