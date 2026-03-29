/**
 * 清理模板定义，移除 Rust Core 不需要的多余字段 (如 name, uuid, shade 等)
 * 以减少最终 templates.json 的体积。
 */
export function cleanTemplate(template: any): any {
    if (!template.elements) return template;

    const cleanedElements = template.elements.map((el: any) => {
        const newEl: any = {
            from: el.from,
            to: el.to,
            faces: el.faces
        };

        if (el.rotation) {
            newEl.rotation = el.rotation;
        }

        if (el.render_layer) {
            newEl.render_layer = el.render_layer;
        }

        // shade 字段目前在 Rust Core schema.rs 中未定义，故移除。
        // 如果将来需要支持元素级光照控制，需同步修改 schema.rs 和此处。

        return newEl;
    });

    return {
        elements: cleanedElements,
        texture_vars: template.texture_vars
    };
}
