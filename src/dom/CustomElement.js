
import { Group } from './Group.js';
import { Object3D } from './Object3D.js';
import { CSSClass } from '../css/CSSClass.js';

export class CustomElement extends Object3D {
    
    constructor(element) {
        
        super();
        
        this.element = element;
        this.domElement.appendChild(element);
        
        this.elementScale = vec2.fromValues(1,1);
        this.elementCenter = vec2.fromValues(.5,.5);
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
        this.elementScale = vec2.fromValues(scale_x,scale_y);
        this.updateElementTransform();
    }
    
    setCenter(center_x, center_y) {
        this.elementCenter = vec2.fromValues(center_x,center_y);
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