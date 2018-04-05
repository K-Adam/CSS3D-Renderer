
export class CSSClass {
    
    constructor() {
        
        this.class_name = "c3r-"+(CSSClass.id_counter++);
        
        this.properties = new Map();
        
        this.domElement = document.createElement("style");
        
    }
    
    init() {
        document.head.appendChild(this.domElement);
    }
    
    unload() {
        document.head.removeChild(this.domElement);
    }
    
    attach(elem) {
        elem.classList.add(this.class_name);
    }
    
    detach(elem) {
        elem.classList.remove(this.class_name);
    }
    
    setProperty(prop, val) {
        this.properties.set(prop, val);
    }
    
    setProperties(props) {
        for(let i in props) {
            this.setProperty(i, props[i]);
        }
    }
    
    update() {
        
        this.domElement.innerHTML = '.'+this.class_name+'{'+
            Array.from(
                this.properties.entries()
            ).map(
                kv => kv.join(':')
            ).join(';')
        +'}';
        
    }
    
    clone() {
        
        var cl = new CSSClass();
        cl.properties = new Map(this.properties);
        return cl;
        
    }
    
}

CSSClass.id_counter = 0;
