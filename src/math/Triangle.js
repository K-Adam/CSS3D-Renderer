
// 3D triangle, represented by 3 points
export class Triangle {
    
    constructor(p1, p2, p3, norm) {
        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;
        
        this.edges = null;
        
        this.norm = norm ? norm : this.calculateNormal();
    }
    
    updateEdges() {
        
        if(this.edges) return;
        
        this.edges = [
            vec3.sub(vec3.create(), this.p1, this.p2),
            vec3.sub(vec3.create(), this.p2, this.p3),
            vec3.sub(vec3.create(), this.p3, this.p1)
        ];
    }
    
    calculateNormal() {
        
        this.updateEdges();
        
        return vec3.normalize(vec3.create(), vec3.cross(
            vec3.create(), this.edges[0], this.edges[1]
        ));
        
    }
    
    calculateEdgeLengths() {
        return vec3.fromValues(
            vec3.len(this.edges[0]),
            vec3.len(this.edges[1]),
            vec3.len(this.edges[2])
        );
    }
    
    getTransformationTo(that) {
        
        let A = mat4.fromValues(
            this.p1[0],   this.p1[1],   this.p1[2],   1,
            this.p2[0],   this.p2[1],   this.p2[2],   1,
            this.p3[0],   this.p3[1],   this.p3[2],   1,
            this.norm[0], this.norm[1], this.norm[2], 0
        );
        
        let B = mat4.fromValues(
            that.p1[0],   that.p1[1],   that.p1[2],   1,
            that.p2[0],   that.p2[1],   that.p2[2],   1,
            that.p3[0],   that.p3[1],   that.p3[2],   1,
            that.norm[0], that.norm[1], that.norm[2], 0
        );
        
        return mat4.mul(
            mat4.create(),
            B,
            mat4.invert(
                mat4.create(),
                A
            )
        );
        
    }
    
}