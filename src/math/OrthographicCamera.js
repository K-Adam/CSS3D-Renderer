export class OrthographicCamera {
    
    constructor(left, right, top, bottom) {
        
        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
        
        // Inverse world
        this.matrix = mat4.create();
        
    }
    
}