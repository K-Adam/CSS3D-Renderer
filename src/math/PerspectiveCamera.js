export class PerspectiveCamera {
    
    constructor(fov = 70) {
        
        this.fov = fov;
        
        // Inverse world
        this.matrix = mat4.create();
        
    }
    
    get perspective_coefficient() {
        return 1.0 / Math.tan(this.fov * Math.PI / 360);
    }
    
}