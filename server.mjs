import http from 'http';
const port = process.env.PORT || 3000;
const server = http.createServer((req,res)=>{
  if (req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,ts:Date.now()}));return;}
  res.writeHead(200,{"content-type":"text/plain"});res.end("ok");
});
server.listen(port,()=>process.stdout.write(`listening ${port}\n`));
