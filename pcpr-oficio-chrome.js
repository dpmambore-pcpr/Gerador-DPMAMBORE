/* Chrome institucional dos ofícios com brasão — Central PCPR */
(function(global){
'use strict';
var VERSION='1.0.0';
var WATERMARK_FILE='brasao-institucional.png';
var FOOTER_BG='#E5E5E5';
var WATERMARK_OPACITY=0.06;
var MM=72/25.4;
var PAGE_W=595.28;
var PAGE_H=841.89;
var FOOTER_H=46;
var WM_WIDTH_PT=118*MM;

function esc(s){
  return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function isDataOrUrl(v){
  var x=String(v||'').trim();
  return /^data:image\//i.test(x)||/^(https?:|blob:|\.\/|\/)/i.test(x)||/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(x);
}
function headerSrc(brasao){
  var x=String(brasao||'').trim();
  if(!x) return WATERMARK_FILE;
  if(isDataOrUrl(x)) return x;
  return 'data:image/png;base64,'+x;
}
function watermarkSrc(){
  return WATERMARK_FILE;
}
function cabecalhoInstitucional(brasao, lines){
  var src=headerSrc(brasao);
  var ls=(lines||[]).map(function(l){return '<div>'+esc(l)+'</div>';}).join('');
  return '<div class="cabecalhoInstitucional cab"><img class="brasaoInstitucional" alt="Brasão da Polícia Civil do Paraná" src="'+src+'">'+ls+'</div>';
}
function marcaDaguaInstitucional(){
  return '<img class="marcaDaguaInstitucional" alt="" src="'+watermarkSrc()+'">';
}
function rodapeInstitucional(lines){
  return '<div class="rodapeInstitucional rod">'+(lines||[]).map(function(l){return '<div>'+esc(l)+'</div>';}).join('')+'</div>';
}
function wrapFolha(innerHtml){
  return '<div class="folha pcpr-oficio-folha">'+marcaDaguaInstitucional()+innerHtml+'</div>';
}
function crestPdfSize(brasaoL, brasaoA, jpegDims){
  var h=(brasaoA||85)*0.75;
  var aspect=(jpegDims&&jpegDims.l&&jpegDims.a)?(jpegDims.l/jpegDims.a):((brasaoL||70)/(brasaoA||85));
  return {w:h*aspect,h:h};
}
function pdfExtGStateName(){return 'GSWm';}
function pdfExtGStateResource(){
  return '/ExtGState << /GSWm << /Type /ExtGState /ca '+WATERMARK_OPACITY+' /CA '+WATERMARK_OPACITY+' >> >>';
}
function pdfWatermarkAndFooterOps(opts){
  opts=opts||{};
  var pageW=opts.pageW||PAGE_W, pageH=opts.pageH||PAGE_H;
  var jpegW=opts.jpegW||750, jpegH=opts.jpegH||933;
  var img=opts.imageName||'Im1';
  var ops=[];
  var aspect=jpegH/jpegW;
  var wmW=WM_WIDTH_PT, wmH=wmW*aspect;
  var wmX=(pageW-wmW)/2;
  var wmY=pageH*0.42-wmH/2;
  if(wmY<FOOTER_H+12) wmY=FOOTER_H+12;
  ops.push('q');
  ops.push('/GSWm gs');
  ops.push(wmW.toFixed(2)+' 0 0 '+wmH.toFixed(2)+' '+wmX.toFixed(2)+' '+wmY.toFixed(2)+' cm /'+img+' Do');
  ops.push('Q');
  ops.push('0.898 0.898 0.898 rg 0 0 '+pageW.toFixed(2)+' '+FOOTER_H.toFixed(2)+' re f 0 g');
  return ops;
}
function pdfHeaderCrestOps(opts){
  opts=opts||{};
  var pageW=opts.pageW||PAGE_W, pageH=opts.pageH||PAGE_H;
  var crest=opts.crest||{w:52.5,h:63.75};
  var img=opts.imageName||'Im1';
  var cx=(pageW-crest.w)/2;
  var cy=pageH-20-crest.h;
  return {
    ops:['q '+crest.w.toFixed(2)+' 0 0 '+crest.h.toFixed(2)+' '+cx.toFixed(2)+' '+cy.toFixed(2)+' cm /'+img+' Do Q'],
    nextY:cy-11
  };
}
function footerTextY(index, total){
  var line=9, block=total*line;
  var start=(FOOTER_H+block)/2-2;
  return start-(index*line);
}
function canvasDrawWatermark(ctx, img, canvasW, canvasH){
  if(!img||!img.width) return;
  var w=canvasW*(118/210), h=w*(img.height/img.width);
  var x=(canvasW-w)/2, y=canvasH*0.58-h/2;
  ctx.save();
  ctx.globalAlpha=WATERMARK_OPACITY;
  ctx.drawImage(img,x,y,w,h);
  ctx.restore();
}
function canvasDrawFooter(ctx, canvasW, canvasH, lines){
  var barH=canvasH*(12.2/297);
  ctx.save();
  ctx.fillStyle=FOOTER_BG;
  ctx.fillRect(0, canvasH-barH, canvasW, barH);
  ctx.fillStyle='#333';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  var fs=Math.max(11, canvasW*0.0115);
  ctx.font=fs+'px Arial, Helvetica, sans-serif';
  var mid=canvasH-barH/2;
  var ls=lines||[];
  if(ls.length<=1){
    ctx.fillText(ls[0]||'', canvasW/2, mid);
  }else{
    ctx.fillText(ls[0], canvasW/2, mid-fs*0.75);
    ctx.fillText(ls.slice(1).join(' '), canvasW/2, mid+fs*0.75);
  }
  ctx.restore();
}
function odtWatermarkStyle(){
  return '<style:style style:name="MarcaDagua" style:family="graphic">'
    +'<style:graphic-properties style:wrap="run-through" style:run-through="background" '
    +'style:vertical-pos="from-top" svg:y="9.4cm" style:vertical-rel="page" '
    +'style:horizontal-pos="center" style:horizontal-rel="page" '
    +'draw:opacity="6%" fo:border="none" style:mirror="none"/>'
    +'</style:style>';
}
function odtWatermarkFrame(){
  return '<text:p text:style-name="HdrCenter"><draw:frame draw:style-name="MarcaDagua" draw:name="MarcaDaguaInstitucional" text:anchor-type="paragraph" svg:width="11.8cm" svg:height="14.68cm">'
    +'<draw:image xlink:href="Pictures/brasao.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>'
    +'</draw:frame></text:p>';
}
function odtFooterStyle(){
  return '<style:style style:name="FtrBox" style:family="paragraph">'
    +'<style:paragraph-properties fo:text-align="center" fo:margin="0in" fo:padding-top="0.10in" fo:padding-bottom="0.10in" fo:padding-left="0.20in" fo:padding-right="0.20in" fo:background-color="#E5E5E5"/>'
    +'<style:text-properties fo:font-size="8pt"/>'
    +'</style:style>';
}

global.PCPROficioChrome={
  VERSION:VERSION,
  WATERMARK_FILE:WATERMARK_FILE,
  FOOTER_BG:FOOTER_BG,
  WATERMARK_OPACITY:WATERMARK_OPACITY,
  PAGE_W:PAGE_W,
  PAGE_H:PAGE_H,
  FOOTER_H:FOOTER_H,
  headerSrc:headerSrc,
  watermarkSrc:watermarkSrc,
  cabecalhoInstitucional:cabecalhoInstitucional,
  marcaDaguaInstitucional:marcaDaguaInstitucional,
  rodapeInstitucional:rodapeInstitucional,
  wrapFolha:wrapFolha,
  crestPdfSize:crestPdfSize,
  pdfExtGStateName:pdfExtGStateName,
  pdfExtGStateResource:pdfExtGStateResource,
  pdfWatermarkAndFooterOps:pdfWatermarkAndFooterOps,
  pdfHeaderCrestOps:pdfHeaderCrestOps,
  footerTextY:footerTextY,
  canvasDrawWatermark:canvasDrawWatermark,
  canvasDrawFooter:canvasDrawFooter,
  odtWatermarkStyle:odtWatermarkStyle,
  odtWatermarkFrame:odtWatermarkFrame,
  odtFooterStyle:odtFooterStyle
};
})(typeof window!=='undefined'?window:this);
