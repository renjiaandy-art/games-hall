importScripts('ai.js');
self.onmessage = function (e) { self.postMessage(self.WeiqiAI.handle(e.data)); };
