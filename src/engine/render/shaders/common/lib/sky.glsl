/**
 * @file sky.glsl
 * @brief 天空与云层颜色工具函数
 *
 * 提供:
 * 1. `getSimpleAtmosphere(viewDir, sunDir)`: 近似天空散射渐变
 * 2. `getClouds(viewDir, sunDir, time, cloudCover)`: 基于 FBM 的平面云层近似
 */

// --- Constants ---
const float EARTH_RADIUS = 6371000.0;
const float ATMOSPHERE_HEIGHT = 100000.0;
const float RAYLEIGH_HEIGHT_SCALE = 8000.0;
const float MIE_HEIGHT_SCALE = 1200.0;

// 基于太阳高度的天空渐变近似。
// viewDir: 观察方向, 已归一化。
// sunDir: 太阳方向, 指向太阳, 已归一化。
vec3 getSimpleAtmosphere(vec3 viewDir, vec3 sunDir) {
    float sunHeight = max(sunDir.y, -0.1); // 限制夜间下界, 避免颜色完全塌陷。

    // 夜晚配色。
    vec3 zenithColorNight = vec3(0.02, 0.04, 0.1);
    vec3 horizonColorNight = vec3(0.05, 0.1, 0.2);

    vec3 zenithColorDay = vec3(0.1, 0.4, 0.9);   // 天顶蓝
    vec3 horizonColorDay = vec3(0.6, 0.8, 1.0);  // 地平线亮蓝

    vec3 zenithColorSunset = vec3(0.3, 0.2, 0.5); // 黄昏天顶
    vec3 horizonColorSunset = vec3(0.9, 0.6, 0.2); // 黄昏地平线

    // 根据太阳高度在昼夜与黄昏之间插值。
    float dayFactor = smoothstep(-0.2, 0.2, sunDir.y);
    float sunsetFactor = 1.0 - abs(sunDir.y + 0.1) * 3.0;
    sunsetFactor = clamp(sunsetFactor, 0.0, 1.0);

    // 先混合昼夜基色。
    vec3 zenith = mix(zenithColorNight, zenithColorDay, dayFactor);
    vec3 horizon = mix(horizonColorNight, horizonColorDay, dayFactor);

    // 再叠加黄昏染色。
    zenith = mix(zenith, zenithColorSunset, sunsetFactor * 0.5);
    horizon = mix(horizon, horizonColorSunset, sunsetFactor);

    // 根据观察方向高度决定更偏向天顶还是地平线。
    float horizonMix = pow(1.0 - max(viewDir.y, 0.0), 3.0);
    vec3 skyGradient = mix(zenith, horizon, horizonMix);

    // 用一个经验项近似太阳光晕。
    float sunDot = max(dot(viewDir, sunDir), 0.0);
    float sunHalo = pow(sunDot, 400.0) * 1.5;
    float sunGlow = pow(sunDot, 8.0) * 0.3 * dayFactor;

    return skyGradient + (vec3(1.0, 0.9, 0.8) * (sunHalo + sunGlow));
}

// 简单哈希。
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// 2D Value Noise。
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 四层 FBM, 用于生成云层密度。
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; ++i) {
        v += a * noise(p);
        p = rot * p * 2.0 + vec2(100.0);
        a *= 0.5;
    }
    return v;
}

// 平面投影云层近似, 用视线与高度平面求交来构造天空云图。
// cloudCover 控制阈值, 数值越大云越厚。
vec4 getClouds(vec3 viewDir, vec3 sunDir, float time, float cloudCover) {
    // 只在朝上的方向绘制云层。
    if (viewDir.y < 0.02) return vec4(0.0);

    // 将视线投影到固定高度平面, 构造云层采样坐标。
    float cloudHeight = 1000.0;
    vec2 skyPos = (viewDir.xz / viewDir.y) * cloudHeight;

    // 风场偏移。
    vec2 wind = vec2(time * 20.0, time * 10.0);
    vec2 coord = (skyPos + wind) * 0.0005;

    // 计算噪声密度并通过 cloudCover 控制覆盖率。
    float noiseVal = fbm(coord);
    noiseVal = smoothstep(1.0 - cloudCover, 1.0, noiseVal);

    // 密度过低时直接跳过。
    if (noiseVal < 0.01) return vec4(0.0);

    // 低仰角时云层更薄, 避免地平线处形成硬边。
    float density = noiseVal * clamp(viewDir.y * 3.0, 0.0, 1.0);

    // 简化太阳侧向照明。
    float sunIntensity = max(dot(viewDir, sunDir), 0.0);
    vec3 cloudBaseColor = vec3(0.95, 0.95, 1.0);
    vec3 cloudShadowColor = vec3(0.7, 0.75, 0.85);

    // 在背光与受光之间插值云颜色。
    vec3 finalCloudColor = mix(cloudShadowColor, cloudBaseColor, density + sunIntensity * 0.2);

    // 用 smoothstep 给云边缘做软化。
    float alpha = smoothstep(0.0, 0.4, density);

    // 贴近地平线时逐步淡出, 避免高频闪烁。
    float horizonFade = smoothstep(0.0, 0.2, viewDir.y);
    alpha *= horizonFade;

    return vec4(finalCloudColor, alpha);
}
