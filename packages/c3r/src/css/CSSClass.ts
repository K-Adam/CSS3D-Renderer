export class CSSClass {
    static #nextId = 0;

    readonly className: string = `c3r-${CSSClass.#nextId++}`;
    properties: Map<string, string> = new Map();
    readonly domElement: HTMLStyleElement = document.createElement("style");

    // Returns a getter that creates and injects the class on first use, so importing touches no DOM
    static lazy(props: Record<string, string>): () => CSSClass {
        let cssClass: CSSClass | undefined;
        return () => {
            if (!cssClass) {
                cssClass = new CSSClass();
                cssClass.setProperties(props);
                cssClass.update();
                cssClass.init();
            }
            return cssClass;
        };
    }

    init(): void {
        document.head.appendChild(this.domElement);
    }

    unload(): void {
        this.domElement.remove();
    }

    attach(elem: Element): void {
        elem.classList.add(this.className);
    }

    detach(elem: Element): void {
        elem.classList.remove(this.className);
    }

    setProperty(prop: string, val: string): void {
        this.properties.set(prop, val);
    }

    setProperties(props: Record<string, string>): void {
        for (const [prop, val] of Object.entries(props)) {
            this.setProperty(prop, val);
        }
    }

    update(): void {
        const body = Array.from(this.properties, ([prop, val]) => `${prop}:${val}`).join(";");
        this.domElement.textContent = `.${this.className}{${body}}`;
    }

    clone(): CSSClass {
        const cl = new CSSClass();
        cl.properties = new Map(this.properties);
        return cl;
    }
}
