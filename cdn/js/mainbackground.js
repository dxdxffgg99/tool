class GridMotion {
    constructor(options = {}) {
        this.options = Object.assign({
            selector: "#grid",
            items: [],
            gradientColor: "black"
        }, options);

        this.parent = document.querySelector(this.options.selector);
        if (!this.parent) {
            console.error("GridMotion: selector not found");
            return;
        }

        this.rowRefs = [];
        this.mouseX = window.innerWidth / 2;

        this.totalItems = 28;
        const defaultItems = Array.from({ length: this.totalItems }, (_, i) => `Item ${i + 1}`);
        this.combinedItems = this.options.items.length > 0
            ? this.options.items.slice(0, this.totalItems)
            : defaultItems;

        this._buildDOM();
        this._setupGSAP();
    }

    _buildDOM() {
        this.parent.innerHTML = "";
        this.parent.classList.add("noscroll", "loading");

        const section = document.createElement("section");
        section.className = "intro";
        section.style.background = `radial-gradient(circle, ${this.options.gradientColor} 0%, transparent 100%)`;

        const container = document.createElement("div");
        container.className = "gridMotion-container";

        for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
            const row = document.createElement("div");
            row.className = "row";
            this.rowRefs[rowIndex] = row;

            for (let itemIndex = 0; itemIndex < 7; itemIndex++) {
                const index = rowIndex * 7 + itemIndex;
                const content = this.combinedItems[index];

                const itemWrapper = document.createElement("div");
                itemWrapper.className = "row__item";

                const itemInner = document.createElement("div");
                itemInner.className = "row__item-inner";
                itemInner.style.backgroundColor = "#111";

                    const imgDiv = document.createElement("div");
                    imgDiv.className = "row__item-img";
                    imgDiv.style.backgroundImage = `url(${content})`;
                    itemInner.appendChild(imgDiv);

                itemWrapper.appendChild(itemInner);
                row.appendChild(itemWrapper);
            }

            container.appendChild(row);
        }

        const fv = document.createElement("div");
        fv.className = "fullview";

        section.appendChild(container);
        section.appendChild(fv);

        this.parent.appendChild(section);
    }

    _setupGSAP() {
        gsap.ticker.lagSmoothing(0);

        this._mouseMoveHandler = e => {
            this.mouseX = e.clientX;
        };
        window.addEventListener("mousemove", this._mouseMoveHandler);

        this._updateMotion = () => {
            const maxMoveAmount = 300;
            const baseDuration = 0.8;
            const inertia = [0.6, 0.4, 0.3, 0.2];

            this.rowRefs.forEach((row, index) => {
                const direction = index % 2 === 0 ? 1 : -1;
                const moveAmount =
                    ((this.mouseX / window.innerWidth) * maxMoveAmount - maxMoveAmount / 2) *
                    direction;

                gsap.to(row, {
                    x: moveAmount,
                    duration: baseDuration + inertia[index % inertia.length],
                    ease: "power3.out",
                    overwrite: "auto"
                });
            });
        };

        this._removeTicker = gsap.ticker.add(this._updateMotion);
    }

    destroy() {
        window.removeEventListener("mousemove", this._mouseMoveHandler);
        if (this._removeTicker) this._removeTicker();
    }
}

Promise.all(
    preloadImages.map(src => {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = src;
        });
    })
).then(() => {
    new GridMotion({
        selector: "#grid",
        items: ["cdn/c++.webp",
        "cdn/go.webp",
        
        "cdn/js.webp",
        "cdn/kotlin.webp",
        "cdn/python.webp","cdn/c++.webp",
        "cdn/go.webp",
        
        "cdn/js.webp",
        "cdn/kotlin.webp",
        "cdn/python.webp","cdn/c++.webp",
        "cdn/go.webp",
        
        "cdn/js.webp",
        "cdn/kotlin.webp",
        "cdn/python.webp","cdn/c++.webp",
        "cdn/go.webp",
        
        "cdn/js.webp",
        "cdn/kotlin.webp",
        "cdn/python.webp","cdn/c++.webp",
        "cdn/go.webp",
        
        "cdn/js.webp",
        "cdn/kotlin.webp",
        "cdn/python.webp","cdn/c++.webp",
        "cdn/go.webp","cdn/c++.webp"],
        gradientColor: "#0f0f0f"
    });
});