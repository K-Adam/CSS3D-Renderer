
import { CSSClass } from '../css/CSSClass.js';
import { RootObject } from './RootObject.js';

import { PerspectiveCamera } from '../math/PerspectiveCamera.js';
import { OrthographicCamera } from '../math/OrthographicCamera.js';

// Firefox mobile (Android)
var perspective_calc_support = CSS.supports('perspective: calc( 512px * 2 )');

export class Container {
    
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
        this.domElement.style.removeProperty("--viewport-width", width+"px");
        this.domElement.style.removeProperty("--viewport-height", height+"px");
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