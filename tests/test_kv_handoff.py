import hashlib, tempfile, unittest, threading, json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from scripts.kv_handoff import Cache, SlotClient, identity

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,value):
        data=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):self.reply(self.server.slots)
    def do_POST(self):
        payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.server.posts.append((self.path,payload))
        file=self.server.root/payload['filename']
        if 'action=save' in self.path:file.write_bytes(b'cache'*100)
        self.reply({'id_slot':0,'filename':file.name,'n_saved':42,'n_restored':42,'n_written':500,'n_read':500})

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name);self.root=root/'private';self.root.mkdir(mode=0o700)
        model=root/'model.gguf';model.write_bytes(b'GGUF model');self.ident=identity(model,'a'*64,4096,'q8_0','q8_0')
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.root=self.root;server.slots=[{'id':0,'is_processing':False,'n_prompt_tokens':42}];server.posts=[]
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        self.server=server;self.cache=Cache(self.root,SlotClient(server.server_port))
    def test_real_http_roundtrip(self):
        token=self.cache.save(self.ident,'chat-1');self.assertEqual(self.cache.restore(token,self.ident,'chat-1')['n_restored'],42);self.assertEqual(len(self.server.posts),2)
    def test_wrong_scope_or_model_no_restore(self):
        token=self.cache.save(self.ident,'chat-1')
        for ident,scope in [(self.ident,'chat-2'),({**self.ident,'ctx':8192},'chat-1')]:
            with self.assertRaises(ValueError):self.cache.restore(token,ident,scope)
        self.assertEqual(len(self.server.posts),1)
    def test_corruption_no_restore(self):
        token=self.cache.save(self.ident,'abc');(self.root/(token+'.bin')).write_bytes(b'bad')
        with self.assertRaises(ValueError):self.cache.restore(token,self.ident,'abc')
    def test_busy_or_ambiguous_slot(self):
        for slots in [[{'id':0,'is_processing':True,'n_prompt_tokens':42}],[{'id':0,'is_processing':False,'n_prompt_tokens':42},{'id':1,'is_processing':False,'n_prompt_tokens':10}]]:
            self.server.slots=slots
            with self.assertRaises(ValueError):self.cache.save(self.ident,'abc')
        self.assertFalse(self.server.posts)
    def test_path_rejection(self):
        with self.assertRaises(ValueError):self.cache.restore('../x',self.ident,'abc')
    def test_identity_hash(self):self.assertEqual(self.ident['model_sha256'],hashlib.sha256(b'GGUF model').hexdigest())
if __name__=='__main__':unittest.main()
