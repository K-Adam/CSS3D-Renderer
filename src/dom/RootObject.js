
import { CSSClass } from '../css/CSSClass.js';
import { Group } from './Group.js';

import { PerspectiveCamera } from '../math/PerspectiveCamera.js';
import { OrthographicCamera } from '../math/OrthographicCamera.js';

// Edge
var transform_value_support = CSS.supports("transform: translateZ(calc(100px * var(--mult-value,1)))");

export class RootObject extends Group {
    
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
        
        if(!css_class) {
            css_class = new CSSClass();
            css_class.setProperties({
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
            css_class.update();
            css_class.init();
        }

        return css_class;
    }
    
}

var css_class = null;
