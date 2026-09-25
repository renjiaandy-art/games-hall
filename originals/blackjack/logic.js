/* logic.js — 21点 (Blackjack) pure game logic. No DOM. MIT.
 * Card id: 0-51. rank = id%13+1 (1=A..13=K). suit = floor(id/13): 0=S 1=H 2=D 3=C. */
(function (root) {
  'use strict';
  const RANK_CH = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_CH = ['♠', '♥', '♦', '♣'];
  const rankOf = (id) => (id % 13) + 1;
  const suitOf = (id) => Math.floor(id / 13);
  const label = (id) => RANK_CH[rankOf(id)] + SUIT_CH[suitOf(id)];
  const isRed = (id) => { const s = suitOf(id); return s === 1 || s === 2; };

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function newShoe(nDecks) {
    const d = [];
    for (let n = 0; n < (nDecks || 1); n++) for (let i = 0; i < 52; i++) d.push(i);
    return shuffle(d);
  }

  function cardValue(id) { const r = rankOf(id); return r === 1 ? 11 : Math.min(r, 10); }
  function handValue(cards) {
    let total = 0, aces = 0;
    cards.forEach((id) => { const r = rankOf(id); if (r === 1) aces++; total += cardValue(id); });
    let soft = aces > 0;
    while (total > 21 && aces > 0) { total -= 10; aces--; soft = aces > 0; }
    return { total, soft: soft && total <= 21 };
  }
  function isBust(cards) { return handValue(cards).total > 21; }
  function isBlackjack(cards) { return cards.length === 2 && handValue(cards).total === 21; }
  function canSplit(hand) { return hand.cards.length === 2 && rankOf(hand.cards[0]) === rankOf(hand.cards[1]) && !hand.isSplitAces; }

  function newHand(cards, bet) { return { cards: cards.slice(), bet, done: false, doubled: false, isSplitAces: false, outcome: null }; }

  function startRound(deck, bet) {
    const player = newHand([deck.pop(), deck.pop()], bet);
    const dealer = { cards: [deck.pop(), deck.pop()] };
    const round = { deck, playerHands: [player], activeHandIdx: 0, dealer, stage: 'player', naturalResolved: false };
    if (isBlackjack(player.cards) || isBlackjack(dealer.cards)) {
      round.stage = 'dealer';
      round.naturalResolved = true;
    }
    return round;
  }

  function activeHand(round) { return round.playerHands[round.activeHandIdx]; }

  function advance(round) {
    let idx = round.activeHandIdx;
    while (idx < round.playerHands.length && round.playerHands[idx].done) idx++;
    round.activeHandIdx = idx;
    if (idx >= round.playerHands.length) round.stage = 'dealer';
  }

  function hit(round) {
    if (round.stage !== 'player') return false;
    const h = activeHand(round);
    if (h.done) return false;
    h.cards.push(round.deck.pop());
    if (isBust(h.cards)) { h.done = true; advance(round); }
    else if (handValue(h.cards).total === 21) { h.done = true; advance(round); }
    return true;
  }
  function stand(round) {
    if (round.stage !== 'player') return false;
    const h = activeHand(round);
    if (h.done) return false;
    h.done = true; advance(round);
    return true;
  }
  function double(round) {
    if (round.stage !== 'player') return false;
    const h = activeHand(round);
    if (h.done || h.cards.length !== 2) return false;
    h.bet *= 2; h.doubled = true;
    h.cards.push(round.deck.pop());
    h.done = true;
    advance(round);
    return true;
  }
  function split(round) {
    if (round.stage !== 'player') return false;
    const h = activeHand(round);
    if (!canSplit(h)) return false;
    const wasAces = rankOf(h.cards[0]) === 1;
    const c2 = h.cards.pop();
    const h2 = newHand([c2], h.bet);
    h.cards.push(round.deck.pop());
    h2.cards.push(round.deck.pop());
    if (wasAces) { h.isSplitAces = true; h2.isSplitAces = true; h.done = true; h2.done = true; }
    round.playerHands.splice(round.activeHandIdx + 1, 0, h2);
    advance(round);
    return true;
  }

  function playDealer(round) {
    if (round.stage !== 'dealer') return false;
    if (round.naturalResolved) { round.stage = 'done'; return true; }
    const allBust = round.playerHands.every((h) => isBust(h.cards));
    if (!allBust) { while (handValue(round.dealer.cards).total < 17) round.dealer.cards.push(round.deck.pop()); }
    round.stage = 'done';
    return true;
  }

  // outcome for one hand vs dealer: 'blackjack' | 'win' | 'push' | 'lose'
  // payoutMultiplier applies to hand.bet, i.e. total returned to player = bet * multiplier (0 = bet lost)
  function resolveHand(hand, dealerCards, dealerHadBlackjack) {
    const p = handValue(hand.cards);
    if (p.total > 21) return { outcome: 'lose', mult: 0 };
    const playerBJ = isBlackjack(hand.cards) && !hand.isSplitAces;
    if (playerBJ && dealerHadBlackjack) return { outcome: 'push', mult: 1 };
    if (playerBJ) return { outcome: 'blackjack', mult: 2.5 };
    if (dealerHadBlackjack) return { outcome: 'lose', mult: 0 };
    const d = handValue(dealerCards);
    if (d.total > 21) return { outcome: 'win', mult: 2 };
    if (p.total > d.total) return { outcome: 'win', mult: 2 };
    if (p.total < d.total) return { outcome: 'lose', mult: 0 };
    return { outcome: 'push', mult: 1 };
  }

  function settleRound(round) {
    const dealerBJ = isBlackjack(round.dealer.cards);
    let totalReturn = 0, totalBet = 0;
    round.playerHands.forEach((h) => {
      const r = resolveHand(h, round.dealer.cards, dealerBJ);
      h.outcome = r.outcome; h.payout = h.bet * r.mult;
      totalReturn += h.payout; totalBet += h.bet;
    });
    return { totalReturn, totalBet, net: totalReturn - totalBet };
  }

  const Blackjack = {
    RANK_CH, SUIT_CH, rankOf, suitOf, label, isRed, newShoe, cardValue, handValue, isBust, isBlackjack,
    canSplit, startRound, activeHand, hit, stand, double, split, playDealer, resolveHand, settleRound,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Blackjack;
  else root.Blackjack = Blackjack;
})(typeof window !== 'undefined' ? window : globalThis);
