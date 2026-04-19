import { AnimationPlugin } from './types';

const webglFluidPlugin: AnimationPlugin = {
  name: 'WebGLFluid',
  hotkey: ['shift', 'w'],
  contextType: 'webgl2',
  animate: (ctx, canvas) => {
    if (!(ctx instanceof WebGL2RenderingContext)) return;
    const gl = ctx;

    // ----- Utility functions -----
    function compileShader(type: number, source: string) {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    function createProgram(vsSource: string, fsSource: string) {
      const vs = compileShader(gl.VERTEX_SHADER, vsSource);
      const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return null;
      const p = gl.createProgram();
      if (!p) return null;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(p));
        gl.deleteProgram(p);
        return null;
      }
      return p;
    }

    // ----- Shaders -----
    const vertexShader = `#version 300 es
    in vec2 aPos;
    out vec2 vUv;
    void main(){
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

    const fragmentShader = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 mouse;
    uniform int palette;

    vec3 paletteVivid(float t) {
      return mix(vec3(0.0,0.1,0.7), vec3(1.0,0.2,0.6), t);
    }
    vec3 paletteDream(float t) {
      return mix(vec3(0.95,0.6,0.2), vec3(0.1,0.6,0.9), t);
    }
    vec3 paletteAurora(float t) {
      return mix(vec3(0.0,0.0,0.0), vec3(0.0,1.0,0.6), t);
    }

    void main(){
      vec2 uv = vUv;
      vec2 p = uv - 0.5;
      float len = length(p);
      float angle = atan(p.y, p.x);

      // swirling animation
      float swirl = sin(len*12.0 - time*2.0 + angle*4.0);
      float intensity = 0.5 + 0.5*sin(len*10.0 - time*3.0 + swirl);

      // palette
      vec3 col;
      if(palette==0) col = paletteVivid(intensity);
      else if(palette==1) col = paletteDream(intensity);
      else col = paletteAurora(intensity);

      // bloom effect
      col += pow(col, vec3(2.0)) * 0.5;

      fragColor = vec4(col, 1.0);
    }`;

    const program = createProgram(vertexShader, fragmentShader);
    if (!program) return;

    const quad = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1,  1, 1, -1, 1, 1
    ]);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Uniform locations
    const timeLoc = gl.getUniformLocation(program, "time");
    const resLoc = gl.getUniformLocation(program, "resolution");
    const mouseLoc = gl.getUniformLocation(program, "mouse");
    const paletteLoc = gl.getUniformLocation(program, "palette");

    // Mouse interaction
    let mouse = [0.5, 0.5];
    canvas.addEventListener("pointermove", e => {
      const rect = canvas.getBoundingClientRect();
      mouse = [
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height
      ];
    });

    // Handle resize
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    // Animation loop
    let start = performance.now();
    function loop() {
      const t = (performance.now() - start) * 0.001;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1f(timeLoc, t);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform2f(mouseLoc, mouse[0], mouse[1]);
      gl.uniform1i(paletteLoc, 0); // change between 0,1,2 for palettes
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(loop);
    }
    loop();
  },
};

export default webglFluidPlugin;