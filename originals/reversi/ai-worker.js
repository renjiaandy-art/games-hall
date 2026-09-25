importScripts('logic.js');
self.onmessage = function (e) {
  var d = e.data;
  var move = self.Reversi.chooseMove(d.board, d.color, d.difficulty, d.budget);
  self.postMessage({ id: d.id, move: move });
};
