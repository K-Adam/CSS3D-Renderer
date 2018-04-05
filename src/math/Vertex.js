export class Vertex {
    
    constructor(position, uv) {
        this.position = position ? position : vec3.create();
        this.uv = uv ? uv : vec2.create();
    }
    
};