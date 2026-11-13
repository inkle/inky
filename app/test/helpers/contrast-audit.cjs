// Evaluate auditContrast.toString() inside a real Chromium document.
// Text uses resolved styles and composited ancestor backgrounds. Indicators
// supply their actual rendered paint property (border, caret or shadow).
// Return every measurement, not just the failures, for release/QA evidence.
function auditContrast(options) {
    const doc = options.frame ? document.querySelector(options.frame).contentDocument : document;
    const win = doc.defaultView;
    const rgb = value => {
        const m = String(value).match(/^rgba?\(([^)]+)\)/);
        if (!m) throw Error("Unsupported computed color: " + value);
        const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
    };
    const mix = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])).concat(1);
    const background = element => {
        const chain = [];
        for (let e = element; e; e = e.parentElement) chain.push(rgb(win.getComputedStyle(e).backgroundColor));
        return chain.reverse().reduce((back, front) => mix(front, back), [255, 255, 255, 1]);
    };
    const luminance = values => values.slice(0, 3).map(v => {
        v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const results = [];
    for (const sample of options.samples) {
        const nodes = [...doc.querySelectorAll(sample.selector)];
        if (!nodes.length) throw Error("Audit target missing: " + sample.selector);
        let measured = 0;
        for (const element of nodes) {
            const rect = element.getBoundingClientRect();
            if (!element.getClientRects().length || rect.bottom <= 0 || rect.top >= win.innerHeight ||
                rect.right <= 0 || rect.left >= win.innerWidth || element.closest('[hidden],[aria-disabled="true"],.vakata-contextmenu-disabled') ||
                element.matches(":disabled")) continue;
            const style = win.getComputedStyle(element, sample.pseudo || null);
            let paint = style[sample.property || "color"];
            if (sample.property === "boxShadow") paint = paint.match(/rgba?\([^)]+\)/)?.[0];
            const foreground = rgb(paint);
            let opacity = 1;
            for (let e = element; e; e = e.parentElement) opacity *= Number(win.getComputedStyle(e).opacity);
            if (sample.property !== "boxShadow" && !sample.ignoreOpacity) foreground[3] *= opacity;
            const backdrop = sample.backgroundSelector ?
                rgb(win.getComputedStyle(doc.querySelector(sample.backgroundSelector))[sample.backgroundProperty || "backgroundColor"]) :
                background(element);
            const composite = mix(foreground, backdrop), actual = ratio(composite, backdrop);
            results.push({name: sample.name, selector: sample.selector, text: (element.value || element.textContent)?.trim().slice(0, 70),
                foreground: composite.slice(0, 3), background: backdrop.slice(0, 3), ratio: actual,
                minimum: sample.minimum || 4.5, pass: actual >= (sample.minimum || 4.5)});
            measured++;
        }
        if (!measured) throw Error("No visible audit target: " + sample.selector);
    }
    return {pass: results.every(item => item.pass), results};
}
module.exports = {auditContrast};
