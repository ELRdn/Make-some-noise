import { definitions } from "./catalog";
import { layerSeed } from "./project";
import type { Project } from "./types";

const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

const fragment = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
out vec4 outColor;
uniform sampler2D previous;
uniform sampler2D sourceImage;
uniform vec2 resolution;
uniform vec2 imageSize;
uniform int kind;
uniform int mode;
uniform int blendMode;
uniform int colorMode;
uniform uint seed;
uniform float time;
uniform float scale;
uniform float amount;
uniform float detail;
uniform float opacity;
uniform vec3 tint;
uniform vec4 background;
uniform bool hasImage;
const float PI=3.141592653589793;
uint hashU(uint x){x=((x>>16u)^x)*0x7feb352du;x=((x>>15u)^x)*0x846ca68bu;return (x>>16u)^x;}
float rnd(vec2 p,uint salt){uvec2 a=uvec2(ivec2(floor(p)));return float(hashU(a.x*0x9e3779b9u^a.y*0x85ebca6bu^seed^salt)>>8u)/16777216.;}
float gauss(vec2 p,uint salt){float a=max(rnd(p,salt),1./16777216.);return sqrt(-2.*log(a))*cos(2.*PI*rnd(p,salt+9987u));}
vec2 gradient(vec2 p){float a=rnd(p,724u)*2.*PI;return vec2(cos(a),sin(a));}
float valueNoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 s=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(rnd(i,1u),rnd(i+vec2(1,0),1u),s.x),mix(rnd(i+vec2(0,1),1u),rnd(i+1.,1u),s.x),s.y);}
float perlin(vec2 p){vec2 i=floor(p),f=fract(p);vec2 s=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(dot(gradient(i),f),dot(gradient(i+vec2(1,0)),f-vec2(1,0)),s.x),mix(dot(gradient(i+vec2(0,1)),f-vec2(0,1)),dot(gradient(i+1.),f-1.),s.x),s.y);}
float simplex(vec2 p){const float F=.3660254037844386,G=.2113248654051871;vec2 i=floor(p+(p.x+p.y)*F);vec2 a=p-i+(i.x+i.y)*G;vec2 o=a.x>a.y?vec2(1,0):vec2(0,1);vec2 b=a-o+G,c=a-1.+2.*G;vec3 w=max(.5-vec3(dot(a,a),dot(b,b),dot(c,c)),0.);w=w*w*w*w;return 70.*dot(w,vec3(dot(gradient(i),a),dot(gradient(i+o),b),dot(gradient(i+1.),c)));}
float worley(vec2 p){vec2 i=floor(p),f=fract(p);float d=2.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 n=vec2(x,y),c=i+n;vec2 o=vec2(rnd(c,12u),rnd(c,23u));d=min(d,length(n+o-f));}return clamp(d,0.,1.);}
float fractal(vec2 p,bool turbulent){float sum=0.,amp=.5,weight=0.;for(int i=0;i<8;i++){if(float(i)>=detail)break;float n=perlin(p)*1.5;sum+=amp*(turbulent?abs(n):n);weight+=amp;p=mat2(.8,-.6,.6,.8)*p*2.03+vec2(19.1,7.7);amp*=.5;}return turbulent?sum/weight:.5+.5*sum/weight;}
vec3 colored(float n,vec2 p,bool gaussian){
  if(colorMode==1){vec3 c=gaussian?vec3(gauss(p,71u),gauss(p,187u),gauss(p,413u))*amount+.5:mix(vec3(.5),vec3(rnd(p,71u),rnd(p,187u),rnd(p,413u)),amount);return clamp(c,0.,1.);}
  if(colorMode==2)return mix(tint*.08,tint,n);
  return vec3(n);
}
vec3 blendRGB(vec3 b,vec3 s){
  if(blendMode==1)return b*s;
  if(blendMode==2)return b+s-b*s;
  if(blendMode==3)return mix(2.*b*s,1.-2.*(1.-b)*(1.-s),step(vec3(.5),b));
  if(blendMode==4){vec3 d=mix(((16.*b-12.)*b+4.)*b,sqrt(b),step(vec3(.25),b));return mix(b-(1.-2.*s)*b*(1.-b),b+(2.*s-1.)*(d-b),step(vec3(.5),s));}
  return s;
}
vec4 composite(vec4 b,vec4 s){s.a*=opacity;float a=s.a+b.a*(1.-s.a);vec3 c=((1.-s.a)*b.a*b.rgb+(1.-b.a)*s.a*s.rgb+b.a*s.a*blendRGB(b.rgb,s.rgb));return vec4(a>0.?c/a:vec3(0),a);}
vec4 samplePrev(vec2 q){return texture(previous,clamp(q,vec2(0),vec2(1)));}
// Segment scratches use neighboring cells so lines do not stop at tile borders.
float wear(vec2 q,float spacing,float density,uint salt){
  vec2 g=q/spacing,c=floor(g);float result=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 id=c+vec2(x,y);float gate=step(rnd(id,salt),density);
    vec2 center=id+vec2(rnd(id,salt+1u),rnd(id,salt+2u));
    float angle=rnd(id,salt+3u)*PI;vec2 dir=vec2(cos(angle),sin(angle));
    vec2 rel=g-center;float len=.12+rnd(id,salt+4u)*.65;
    float along=clamp(dot(rel,dir),-len,len);float dist=length(rel-dir*along)*spacing;
    float aa=max(.3,fwidth(dist));float line=1.-smoothstep(.12,.25+aa,dist);
    float broken=.25+.75*valueNoise(q*.11+id*7.);
    result=max(result,line*gate*broken);
  }return result;
}
float debris(vec2 q,float spacing,float density){
  vec2 id=floor(q/spacing),f=fract(q/spacing);
  vec2 center=.2+.6*vec2(rnd(id,842u),rnd(id,843u));
  vec2 delta=(f-center)*spacing;
  float radius=.35+pow(rnd(id,844u),7.)*3.5;
  float shape=length(delta*vec2(1.,.6+rnd(id,845u)));
  float edge=1.-smoothstep(radius*.35,radius+max(.4,fwidth(shape)),shape);
  return edge*step(rnd(id,846u),density);
}
vec3 signalField(vec2 q){
  vec3 result=vec3(0);
  float cluster=smoothstep(.28,.7,valueNoise(vec2(q.x/(scale*5.),q.y/(scale*1.5))));
  for(int i=0;i<4;i++){
    float octave=pow(2.,float(i));
    vec2 size=vec2(scale*(2.+float(i)),max(.7,scale/(octave*(3.+detail))));
    vec2 id=floor(q/size);float row=rnd(vec2(id.y,float(i)),381u);
    vec2 shifted=q+vec2(row*scale*5.,0.);id=floor(shifted/size);
    float enabled=step(rnd(id,382u+uint(i)),amount*cluster);
    float gap=step(.04,fract(shifted.x/size.x));
    vec3 hue=.5+.5*cos(6.28318*(rnd(id,389u)+vec3(0,.33,.67)));
    hue=mix(hue,vec3(1),pow(rnd(id,390u),4.));
    float fine=.3+.7*rnd(floor(q/vec2(1.,max(1.,size.y))),394u);
    result+=hue*enabled*gap*fine*(.55+float(i)*.12);
  }
  return clamp(result,0.,1.);
}
vec4 lightMaterial(vec3 light){
  light=clamp(light,0.,1.);float a=max(light.r,max(light.g,light.b));
  if(colorMode==0)light=vec3(dot(light,vec3(.2126,.7152,.0722)));
  if(colorMode==2)light=tint*a;
  return vec4(a>0.?light/a:vec3(0),a);
}
void main(){
  if(mode==0){outColor=background;if(hasImage){float k=min(resolution.x/imageSize.x,resolution.y/imageSize.y);vec2 size=imageSize*k/resolution;vec2 q=(uv-.5)/size+.5;if(all(greaterThanEqual(q,vec2(0)))&&all(lessThanEqual(q,vec2(1))))outColor=texture(sourceImage,q);}return;}
  vec4 b=texture(previous,uv);
  if(mode==2){outColor=b;return;}
  vec2 pixel=vec2(uv.x,1.-uv.y)*resolution;
  vec2 cell=floor(pixel/max(scale,1.));
  vec2 p=pixel/max(scale,1.)+vec2(time*.12,time*.07);
  vec2 frame=vec2(floor(time*24.)*317.,floor(time*24.)*71.);
  vec4 s=vec4(0,0,0,1);
  float n=.5;
  if(kind==0||kind==1||kind==10){bool g=kind!=0;n=g?.5+gauss(cell+frame,1u)*amount:mix(.5,rnd(cell+frame,1u),amount);float density=detail/8.;if(rnd(cell+frame,532u)>density)n=.5;s.rgb=colored(clamp(n,0.,1.),cell+frame,g);if(rnd(cell+frame,532u)>density)s.rgb=colorMode==2?mix(tint*.08,tint,.5):vec3(.5);}
  else if(kind==2){float r=rnd(cell+frame,1u);n=rnd(cell+frame,2u)<detail/9.?1.:0.;vec3 dots=colorMode==1?step(vec3(rnd(cell+frame,2u),rnd(cell+frame,3u),rnd(cell+frame,4u)),vec3(detail/9.)):colorMode==2?tint*n:vec3(n);s=vec4(dots,r<amount?1.:0.);}
  else if(kind>=3&&kind<=9){
    if(kind==3)n=valueNoise(p);
    if(kind==4)n=.5+perlin(p)*.75;
    if(kind==5)n=.5+simplex(p)*.5;
    if(kind==6)n=pow(worley(p),detail*.3);
    if(kind==7)n=fractal(p,false);
    if(kind==8)n=fractal(p,true);
    if(kind==9)n=.5+.5*sin(p.x*5.+fractal(p,false)*amount*35.);
    if(kind!=9)n=clamp((n-.5)*(1.+amount*3.)+.5,0.,1.);
    if(kind>=3&&kind<=5)n=clamp((n-.5)*(detail*.2+.4)+.5,0.,1.);
    s.rgb=colorMode==2?mix(tint*.075,tint,n):colorMode==1?clamp(vec3(n,valueNoise(p+7.),valueNoise(p+19.)),0.,1.):vec3(n);
  }
  else if(kind==11){float band=floor(pixel.x/scale);float period=floor(time*3.);float r=rnd(vec2(band,period),2u);float center=(band+rnd(vec2(band,period),3u))*scale;float width=.25+detail*.2;float line=1.-smoothstep(width,width+1.,abs(pixel.x-center));float broken=step(.22,valueNoise(vec2(band,pixel.y/75.+time*2.)));s=vec4(colorMode==2?tint:vec3(.86),line*broken*step(r,amount));}
  else if(kind==12){vec2 c=floor(pixel/scale),f=fract(pixel/scale);vec2 pos=vec2(rnd(c+frame,2u),rnd(c+frame,3u));float dist=length((f-pos)*scale);float radius=.4+detail*.45;float a=(1.-smoothstep(radius*.4,radius,dist))*step(rnd(c+frame,4u),amount);s=vec4(colorMode==2?tint:vec3(.85),a);}
  else if(kind==13){n=valueNoise(vec2(time*(1.+detail*.5)/max(scale*.1,.1),0));s=vec4(colorMode==2?tint:vec3(n>.5?1.:0.),abs(n-.5)*2.*amount);}
  else if(kind==14){float y=mod(pixel.y+time*10.,scale);float thickness=scale*(.1+detail*.08);float a=(1.-smoothstep(thickness,thickness+.6,y))*amount;s=vec4(colorMode==2?tint:vec3(0),a);}
  else if(kind==15||kind==16||kind==17){
    vec2 q=uv;vec4 e=b;
    if(kind==15){float line=floor(pixel.y/scale);float shift=(valueNoise(vec2(line,time*(.5+detail)))-.5)*amount*resolution.x*.12;q.x+=shift/resolution.x;e=samplePrev(q);}
    if(kind==16){float a=(detail-1.)*PI/4.;vec2 shift=vec2(cos(a),sin(a))*scale*amount*(1.+.15*sin(time*2.))/resolution;vec4 r=samplePrev(q+shift),bl=samplePrev(q-shift);float alpha=max(b.a,max(r.a,bl.a));e=vec4(alpha>0.?vec3(r.r*r.a,b.g*b.a,bl.b*bl.a)/alpha:vec3(0),alpha);}
    if(kind==17){vec2 block=floor(pixel/vec2(scale*2.,scale*.35))+frame;float enabledBlock=step(rnd(block,54u),amount);q.x+=(rnd(block,8u)-.5)*enabledBlock*detail*.018;e=samplePrev(q);}
    float a=mix(b.a,e.a,opacity);vec3 prem=mix(b.rgb*b.a,e.rgb*e.a,opacity);outColor=vec4(a>0.?prem/a:vec3(0),a);return;
  }
  else if(kind==18){float vertical=valueNoise(vec2(pixel.x/scale,pixel.y/(scale*(4.+detail*2.)))+vec2(time*.1));float horizontal=valueNoise(vec2(pixel.x/(scale*(3.+detail)),pixel.y/scale)+vec2(time*.1));float fine=rnd(floor(pixel),3u);n=clamp(.92+((vertical-.5)*.45+(horizontal-.5)*.35+(fine-.5)*.2)*amount,0.,1.);s.rgb=colorMode==2?tint*n:vec3(n);}
  else if(kind==19){ivec2 c=ivec2(cell)&3;int x=c.x,y=c.y;int v=((x&1)^(y&1))*8+(y&1)*4+(((x>>1)&1)^((y>>1)&1))*2+((y>>1)&1);float threshold=(float(v)+.5)/16.;float shade=valueNoise(pixel/(scale*detail*4.)+time*.1);float dotMask=step(length(fract(pixel/scale)-.5),.38);s=vec4(colorMode==2?tint:vec3(.08),step(threshold,shade)*dotMask*amount);}
  else if(kind==20){
    vec2 q=pixel+vec2(time*2.);float marks=0.;
    for(int i=0;i<4;i++){
      float size=scale*pow(1.9,float(i)-1.);
      marks+=wear(q+float(i)*83.,size,amount*detail/8.,501u+uint(i)*11u)*(.6-float(i)*.09);
    }
    float cloud=valueNoise(q/(scale*3.));float fine=rnd(floor(q),563u);
    float rough=pow(valueNoise(q/3.),3.)*.18;
    n=clamp(.035+amount*(cloud*.24+fine*.06+rough+marks),0.,1.);
    s=vec4(colorMode==2?tint*n:vec3(n),1.);
  }
  else if(kind==21){
    vec2 q=pixel+frame;float dust=debris(q,max(4.,scale),amount);
    float micro=step(.996-amount*.008,rnd(floor(q),867u))*.4;
    float hairs=wear(q,scale*2.5,amount*.22,871u);
    float band=floor(q.x/(scale*3.));float center=(band+rnd(vec2(band,0),887u))*scale*3.;
    float dist=abs(q.x-center);float line=1.-smoothstep(.12,.5+fwidth(dist),dist);
    line*=step(rnd(vec2(band,0),888u),detail*.045)*smoothstep(.3,.7,valueNoise(vec2(band,q.y/110.)));
    s=vec4(colorMode==2?tint:vec3(.94,.92,.86),clamp(dust+micro+hairs+line*.7,0.,1.));
  }
  else if(kind==22){s=lightMaterial(signalField(pixel+frame));}
  else if(kind==23){
    vec2 q=pixel+frame;vec2 center=resolution*vec2(.35+rnd(vec2(0),911u)*.3,.35+rnd(vec2(0),912u)*.3);
    vec2 d=(pixel-center)/vec2(scale*4.,scale*1.7);
    float core=exp(-dot(d,d)*1.6);
    float smear=exp(-abs(d.x)*.55-d.y*d.y*.8);
    float lines=pow(valueNoise(vec2(q.x/(scale*5.),q.y/(1.+(9.-detail)*.3))),3.);
    vec3 spectral=.5+.5*cos(q.y*.027+vec3(0,2,4)+valueNoise(q/scale)*3.);
    vec3 light=(core*vec3(1.1,1.05,.85)+smear*lines*(spectral+.25))*amount*2.;
    light+=signalField(q)*smear*.4;
    s=lightMaterial(light);
  }
  else if(kind==24){
    vec2 q=pixel+vec2(time*3.);vec2 pos=pixel/resolution;
    float warm=pow(valueNoise(q/(scale*2.)+14.),2.5);
    float cool=pow(valueNoise(q/(scale*1.5)+83.),3.);
    float edge=pow(abs(pos.x-.5)*2.,5.)+pow(abs(pos.y-.5)*2.,5.);
    float grain=pow(rnd(floor(q),951u),7.-detail*.4);
    vec3 light=(vec3(.65,.15,.035)*warm+vec3(.055,.55,.7)*cool+vec3(.28,.22,.13)*edge)*grain*amount*2.;
    light+=vec3(.8,.72,.55)*(debris(q,35.,amount*.25)+wear(q,scale,detail*.025,963u)*.35);
    s=lightMaterial(light);
  }
  else if(kind==25){
    vec2 q=pixel/scale;
    vec2 drift=vec2(time*.17,time*.11);
    vec2 warp=vec2(simplex(q*.63+drift+17.),simplex(q*.63-drift+41.));
    q+=warp*(.15+detail*.13);
    float field=simplex(q+drift)*.5+.5;
    // Soft threshold gives rounded islands, with dark voids between them.
    float mask=smoothstep(.44-amount*.1,.68-amount*.1,field);
    vec3 channels=vec3(simplex(q*.8+drift+vec2(7,13)),simplex(q*.8-drift+vec2(27,3)),simplex(q*.8+drift+vec2(4,37)))*.5+.5;
    vec3 light=smoothstep(vec3(.25),vec3(.65),channels)*mask*(1.+amount*1.4);
    light+=vec3(pow(mask,5.))*amount*.55;
    light=clamp(light,0.,1.);
    if(colorMode==0)light=vec3(dot(light,vec3(.2126,.7152,.0722)));
    if(colorMode==2)light=tint*max(light.r,max(light.g,light.b));
    s=vec4(light,1.);
  }
  else if(kind==26||kind==27){
    vec2 tick=vec2(floor(time*14.)*157.,floor(time*14.)*53.);
    vec3 grain=vec3(rnd(cell+tick,1001u),rnd(cell+tick,1002u),rnd(cell+tick,1003u));
    vec3 light=grain*.78+.035;
    if(kind==27){light+=grain*(amount-.78)+(detail-4.)*.04;}
    else {
    vec2 q=vec2(pixel.x/resolution.x,pixel.y/resolution.y);
    float lane=floor(q.y*(detail+2.));
    float bandCenter=rnd(vec2(lane,floor(time*2.)),1011u);
    float span=fract(q.y*(detail+2.));
    float band=1.-smoothstep(.1,.35,abs(span-bandCenter));
    band*=smoothstep(.25,.8,valueNoise(vec2(q.x*3.+time*.5,lane+time*.4)));
    float streak=valueNoise(vec2(pixel.x/(scale*90.),pixel.y/(scale*1.5))+tick);
    vec3 hue=.5+.5*cos(6.28318*(rnd(vec2(lane,floor(time)),1015u)+vec3(0,.333,.667)));
    light+=(hue-.4)*band*amount*(.35+streak*.8);
    }
    if(colorMode==0)light=vec3(dot(light,vec3(.2126,.7152,.0722)));
    if(colorMode==2)light=tint*dot(light,vec3(.3333));
    s=vec4(clamp(light,0.,1.),1.);
  }
  outColor=composite(b,s);
}`;

export function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}
export class NoiseRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly maxSize: number;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private textures: WebGLTexture[] = [];
  private buffers: WebGLFramebuffer[] = [];
  private imageTexture: WebGLTexture;
  private image: HTMLImageElement | null = null;
  private size = "";
  private vao: WebGLVertexArrayObject;
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl)
      throw new Error(
        "WebGL2が必要です。ブラウザのハードウェアアクセラレーションを有効にしてください。",
      );
    this.gl = gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxSize = Math.min(
      4096,
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      viewport[0],
      viewport[1],
    );
    const compile = (type: number, code: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, code);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`描画プログラムを準備できません: ${info}`);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vertex),
      f = compile(gl.FRAGMENT_SHADER, fragment);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, v);
    gl.attachShader(this.program, f);
    gl.linkProgram(this.program);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(
        `描画の初期化に失敗しました: ${gl.getProgramInfoLog(this.program)}`,
      );
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.imageTexture = this.makeTexture();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
  }
  private loc(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }
  private makeTexture() {
    const gl = this.gl,
      t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private resize(width: number, height: number) {
    if (
      width > this.maxSize ||
      height > this.maxSize ||
      width < 1 ||
      height < 1
    )
      throw new Error(`この端末では各辺${this.maxSize}pxまで保存できます。`);
    const key = `${width}x${height}`;
    if (this.size === key) return;
    const gl = this.gl;
    this.canvas.width = width;
    this.canvas.height = height;
    this.textures.forEach((t) => gl.deleteTexture(t));
    this.buffers.forEach((b) => gl.deleteFramebuffer(b));
    this.textures = [];
    this.buffers = [];
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < 2; i++) {
      const t = this.makeTexture();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      const b = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, b);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        t,
        0,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error(
          "画像用のメモリが不足しています。サイズを小さくしてください。",
        );
      this.textures.push(t);
      this.buffers.push(b);
    }
    this.size = key;
  }
  render(
    project: Project,
    time: number,
    width: number,
    height: number,
    image: HTMLImageElement | null = null,
    transparent = false,
  ) {
    const gl = this.gl;
    if (gl.isContextLost())
      throw new Error(
        "描画接続が失われました。設定を保存してページを再読み込みしてください。",
      );
    this.resize(width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.uniform1i(this.loc("previous"), 0);
    gl.uniform1i(this.loc("sourceImage"), 1);
    gl.uniform2f(this.loc("resolution"), project.width, project.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    if (image && image !== this.image) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.image = image;
    }
    gl.uniform2f(
      this.loc("imageSize"),
      image?.naturalWidth || 1,
      image?.naturalHeight || 1,
    );
    gl.uniform1i(
      this.loc("hasImage"),
      !transparent && project.background === "image" && !!image ? 1 : 0,
    );
    const solid = !transparent && project.background === "solid";
    const bg: [number, number, number] = solid
      ? rgb(project.backgroundColor)
      : [0, 0, 0];
    gl.uniform4f(this.loc("background"), ...bg, solid ? 1 : 0);
    gl.uniform1i(this.loc("mode"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[0]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    let current = 0;
    for (const layer of project.layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      const next = 1 - current;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[next]);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[current]);
      gl.uniform1i(this.loc("mode"), 1);
      gl.uniform1i(
        this.loc("kind"),
        definitions.findIndex((d) => d.id === layer.kind),
      );
      gl.uniform1i(
        this.loc("blendMode"),
        ["normal", "multiply", "screen", "overlay", "soft-light"].indexOf(
          layer.blend,
        ),
      );
      gl.uniform1i(
        this.loc("colorMode"),
        ["mono", "rgb", "tint"].indexOf(layer.params.colorMode),
      );
      gl.uniform1ui(this.loc("seed"), layerSeed(project, layer));
      gl.uniform1f(this.loc("time"), time * layer.params.speed);
      gl.uniform1f(this.loc("scale"), layer.params.scale);
      gl.uniform1f(this.loc("amount"), layer.params.amount);
      gl.uniform1f(this.loc("detail"), layer.params.detail);
      gl.uniform1f(this.loc("opacity"), layer.opacity);
      gl.uniform3f(this.loc("tint"), ...rgb(layer.params.color));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      current = next;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[current]);
    gl.uniform1i(this.loc("mode"), 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
  }
  pixels(): Uint8Array {
    const gl = this.gl,
      p = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      p,
    );
    return p;
  }
  destroy() {
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    this.buffers.forEach((b) => gl.deleteFramebuffer(b));
    gl.deleteTexture(this.imageTexture);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
