
import { Renderer, Program, Mesh, Triangle, Color } from 'https://unpkg.com/ogl@1.0.11/src/index.js';

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

export class ThreadsBackground {
  constructor(container, {
    color = [1, 1, 1],
    amplitude = 1,
    distance = 0,
    enableMouseInteraction = false
  } = {}) {
    this.container = container;
    this.color = color;
    this.amplitude = amplitude;
    this.distance = distance;
    this.enableMouseInteraction = enableMouseInteraction;

    this.renderer = null;
    this.gl = null;
    this.program = null;
    this.mesh = null;
    this.animationFrameId = null;

    this.currentMouse = [0.5, 0.5];
    this.targetMouse = [0.5, 0.5];

    this._init();
  }

  _init() {
    const renderer = new Renderer({ alpha: true });
    this.renderer = renderer;
    const gl = renderer.gl;
    this.gl = gl;

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([w, h, w / h]) },
        uColor: { value: new Color(...this.color) },
        uAmplitude: { value: this.amplitude },
        uDistance: { value: this.distance },
        uMouse: { value: new Float32Array([0.5, 0.5]) }
      }
    });

    this.program = program;
    this.mesh = new Mesh(gl, { geometry, program });

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();

    if (this.enableMouseInteraction) {
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleMouseLeave = this.handleMouseLeave.bind(this);
      this.container.addEventListener('mousemove', this.handleMouseMove);
      this.container.addEventListener('mouseleave', this.handleMouseLeave);
    }

    this._update = this._update.bind(this);
    this.animationFrameId = requestAnimationFrame(this._update);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const res = this.program.uniforms.iResolution.value;
    res[0] = w;
    res[1] = h;
    res[2] = w / h;
  }

  handleMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - (e.clientY - rect.top) / rect.height;
    this.targetMouse[0] = x;
    this.targetMouse[1] = y;
  }

  handleMouseLeave() {
    this.targetMouse[0] = 0.5;
    this.targetMouse[1] = 0.5;
  }

  _update(t) {
    const uMouse = this.program.uniforms.uMouse.value;

    if (this.enableMouseInteraction) {
      const smoothing = 0.05;
      this.currentMouse[0] += smoothing * (this.targetMouse[0] - this.currentMouse[0]);
      this.currentMouse[1] += smoothing * (this.targetMouse[1] - this.currentMouse[1]);
      uMouse[0] = this.currentMouse[0];
      uMouse[1] = this.currentMouse[1];
    } else {
      uMouse[0] = 0.5;
      uMouse[1] = 0.5;
    }

    this.program.uniforms.iTime.value = t * 0.001;
    this.renderer.render({ scene: this.mesh });
    this.animationFrameId = requestAnimationFrame(this._update);
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.resize);

    if (this.enableMouseInteraction) {
      this.container.removeEventListener('mousemove', this.handleMouseMove);
      this.container.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    if (this.container && this.gl && this.gl.canvas.parentNode === this.container) {
      this.container.removeChild(this.gl.canvas);
    }
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
