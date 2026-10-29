import type { PDFFont } from 'pdf-lib';
import { importResume } from './intake';
import { normalizeDocumentText } from './edits';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export function wrapLine(text:string,font:Pick<PDFFont,'widthOfTextAtSize'>,size:number,width:number) {
  const lines:string[]=[];let line='';
  for(const word of text.split(/\s+/)) {
    if(font.widthOfTextAtSize(word,size)>width)throw new Error('An unbroken word or URL is too wide. Shorten its display text before export.');
    const proposed=line?`${line} ${word}`:word;
    if(font.widthOfTextAtSize(proposed,size)>width){lines.push(line);line=word;}else line=proposed;
  }
  if(line)lines.push(line);return lines;
}
const heading=(text:string)=>/^(experience|employment|education|projects|skills|summary|certifications|publications|languages)$/i.test(text.trim());
export async function generateResume(text:string,format:'pdf'|'docx') {
  const paragraphs=text.split(/\n+/).filter(p=>p.trim());let bytes:Uint8Array<ArrayBuffer>;
  if(format==='pdf') {
    const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
    const pdf=await PDFDocument.create();pdf.setTitle('Resume');pdf.setAuthor('');pdf.setCreator('ApplyPilot');pdf.setProducer('ApplyPilot local resume export');pdf.setLanguage('en');
    const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    try{regular.encodeText(text.replace(/\n/g,' '));}catch{throw new Error('This PDF template cannot render one or more characters. Keep the original, export DOCX, or use an external editor with an appropriate font.');}
    let page=pdf.addPage([612,792]),y=738;
    for(let index=0;index<paragraphs.length;index++){
      const paragraph=paragraphs[index]!;const isHeading=heading(paragraph),size=index===0?17:isHeading?12:10.5,font=index===0||isHeading?bold:regular;
      const lines=wrapLine(paragraph,font,size,504),lineHeight=size*1.4;
      if(y<54+lineHeight*(isHeading?3:2)){page=pdf.addPage([612,792]);y=738;}
      for(const line of lines){if(y<54+lineHeight){page=pdf.addPage([612,792]);y=738;}if(pdf.getPageCount()>20)throw new Error('Generated resume exceeds 20 pages.');page.drawText(line,{x:54,y,size,font,color:rgb(0,0,0)});y-=lineHeight;}
      y-=isHeading?6:9;
    }
    bytes=new Uint8Array(await pdf.save());
  } else {
    const {Document,Paragraph,TextRun,HeadingLevel,Packer}=await import('docx');
    const document=new Document({creator:'',title:'Resume',description:'Reviewed local resume derivative',styles:{default:{document:{run:{font:'Arial',size:21,color:'000000'},paragraph:{spacing:{after:140,line:280}}}}},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080}}},children:paragraphs.map((text,index)=>new Paragraph({heading:index===0?HeadingLevel.TITLE:heading(text)?HeadingLevel.HEADING_1:undefined,keepNext:index===0||heading(text),children:[new TextRun({text,font:'Arial',color:'000000',bold:index===0||heading(text),size:index===0?34:heading(text)?24:21})]}))}]});
    bytes=new Uint8Array(await (await Packer.toBlob(document)).arrayBuffer());
  }
  const file=new File([bytes],`applypilot-reviewed-resume.${format}`,{type:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const resume=await importResume(file);
  if(normalizeDocumentText(resume.text)!==normalizeDocumentText(text))throw new Error('Generated document text did not match the approved content. Export was withheld.');
  return {resume,bytes};
}
export async function pdfPreviews(bytes:Uint8Array<ArrayBuffer>):Promise<string[]> {
  const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
  const task=getDocument({data:bytes.slice(),useWorkerFetch:false,disableFontFace:false,useSystemFonts:false,standardFontDataUrl:chrome.runtime.getURL('pdf-fonts/')});
  try{const pdf=await task.promise;const images:string[]=[];
    for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const viewport=page.getViewport({scale:1});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvas,viewport}).promise;images.push(canvas.toDataURL('image/png'));canvas.width=0;canvas.height=0;}
    return images;
  }finally{await task.destroy();}
}
