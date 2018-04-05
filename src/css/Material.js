export class Material {
    
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