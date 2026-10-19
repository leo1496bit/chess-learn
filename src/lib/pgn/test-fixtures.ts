// Parties réelles du compte Leny_l, au format de l'API Chess.com (champs tcn/fen omis).
// Utilisées uniquement par les tests.

import type { ChesscomGame } from "@/lib/chesscom/schemas";

export const WIN_AS_WHITE_BY_MATE: ChesscomGame = {
  url: "https://www.chess.com/game/live/146601720196",
  pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.12.11"]
[Round "-"]
[White "Leny_l"]
[Black "CallMeKnox"]
[Result "1-0"]
[CurrentPosition "rn1qkb2/pp2np2/3p1Np1/2p1p3/4P1b1/5N1r/PPPPBP2/R1BQ1RK1 b q - 3 13"]
[Timezone "UTC"]
[ECO "C41"]
[ECOUrl "https://www.chess.com/openings/Philidor-Defense"]
[UTCDate "2025.12.11"]
[UTCTime "21:12:02"]
[WhiteElo "109"]
[BlackElo "100"]
[TimeControl "180"]
[Termination "Leny_l won by checkmate"]
[StartTime "21:12:02"]
[EndDate "2025.12.11"]
[EndTime "21:14:38"]
[Link "https://www.chess.com/game/live/146601720196"]

1. e4 {[%clk 0:02:58.9]} 1... e5 {[%clk 0:02:58.5]} 2. Nf3 {[%clk 0:02:58.1]} 2... d6 {[%clk 0:02:57.1]} 3. Bd3 {[%clk 0:02:50.6]} 3... Bg4 {[%clk 0:02:55]} 4. Nc3 {[%clk 0:02:46.3]} 4... g6 {[%clk 0:02:49.4]} 5. h3 {[%clk 0:02:40.2]} 5... Be6 {[%clk 0:02:41.1]} 6. O-O {[%clk 0:02:29]} 6... h5 {[%clk 0:02:37.1]} 7. g4 {[%clk 0:02:25]} 7... hxg4 {[%clk 0:02:31.4]} 8. hxg4 {[%clk 0:02:22.1]} 8... Bxg4 {[%clk 0:02:29.2]} 9. Nd5 {[%clk 0:02:13.8]} 9... c6 {[%clk 0:02:17.5]} 10. Nb4 {[%clk 0:02:06.3]} 10... Rh3 {[%clk 0:02:12.6]} 11. Be2 {[%clk 0:01:50.1]} 11... c5 {[%clk 0:02:02.7]} 12. Nd5 {[%clk 0:01:39]} 12... Ne7 {[%clk 0:01:55.1]} 13. Nf6# {[%clk 0:01:35.1]} 1-0
`,
  time_control: "180",
  end_time: 1765487678,
  rated: true,
  uuid: "09b6ddcf-d6d6-11f0-ad0f-9ad39701000f",
  time_class: "blitz",
  rules: "chess",
  white: { rating: 109, result: "win", username: "Leny_l", uuid: "1dd19144-7619-11f0-b961-67b333845d7b" },
  black: { rating: 100, result: "checkmated", username: "CallMeKnox", uuid: "71342b0a-cd1d-11ed-bb19-e5470a76fae4" },
  eco: "https://www.chess.com/openings/Philidor-Defense",
};

export const LOSS_AS_BLACK_ON_TIME: ChesscomGame = {
  url: "https://www.chess.com/game/live/166990584950",
  pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.04.07"]
[Round "-"]
[White "Mhoge8"]
[Black "Leny_l"]
[Result "1-0"]
[CurrentPosition "r2qk2r/pQ1n1ppp/2N1p3/3p4/8/2P5/PPP2PPP/R1B1K2R b KQkq - 0 12"]
[Timezone "UTC"]
[ECO "B10"]
[ECOUrl "https://www.chess.com/openings/Caro-Kann-Defense"]
[UTCDate "2026.04.07"]
[UTCTime "16:02:13"]
[WhiteElo "322"]
[BlackElo "292"]
[TimeControl "180"]
[Termination "Mhoge8 won on time"]
[StartTime "16:02:13"]
[EndDate "2026.04.07"]
[EndTime "16:06:31"]
[Link "https://www.chess.com/game/live/166990584950"]

1. e4 {[%clk 0:02:59.9]} 1... c6 {[%clk 0:02:58.3]} 2. Bc4 {[%clk 0:02:58.6]} 2... d5 {[%clk 0:02:57.5]} 3. exd5 {[%clk 0:02:56.5]} 3... cxd5 {[%clk 0:02:56.6]} 4. Bb5+ {[%clk 0:02:51.5]} 4... Bd7 {[%clk 0:02:50.3]} 5. Nc3 {[%clk 0:02:41.4]} 5... Nf6 {[%clk 0:02:41]} 6. Qe2 {[%clk 0:02:38]} 6... e6 {[%clk 0:02:26.9]} 7. Nf3 {[%clk 0:02:36.2]} 7... Bb4 {[%clk 0:02:17.3]} 8. Ne5 {[%clk 0:02:27.4]} 8... Bxc3 {[%clk 0:01:56.3]} 9. dxc3 {[%clk 0:02:16.6]} 9... Bxb5 {[%clk 0:01:19.5]} 10. Qxb5+ {[%clk 0:02:12.8]} 10... Nfd7 {[%clk 0:00:48.2]} 11. Qxb7 {[%clk 0:01:59.6]} 11... Nc6 {[%clk 0:00:27.2]} 12. Nxc6 {[%clk 0:01:51.5]} 1-0
`,
  time_control: "180",
  end_time: 1775577991,
  rated: true,
  uuid: "240e427d-329b-11f1-9b22-8e0bf401000f",
  time_class: "blitz",
  rules: "chess",
  white: { rating: 322, result: "win", username: "Mhoge8", uuid: "2408cd9c-6292-11f0-bed2-c5f865418ac0" },
  black: { rating: 292, result: "timeout", username: "Leny_l", uuid: "1dd19144-7619-11f0-b961-67b333845d7b" },
  eco: "https://www.chess.com/openings/Caro-Kann-Defense",
};

export const DRAW_BY_AGREEMENT: ChesscomGame = {
  url: "https://www.chess.com/game/live/143946293404",
  pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.10.05"]
[Round "-"]
[White "Leny_l"]
[Black "DubsTrubs"]
[Result "1/2-1/2"]
[CurrentPosition "r2q1rk1/2p2pb1/p1npbn1p/4p1p1/B1NPP3/2P2N2/PP2QPPP/R1B2RK1 w - - 6 13"]
[Timezone "UTC"]
[ECO "C55"]
[ECOUrl "https://www.chess.com/openings/Italian-Game-Two-Knights-Modern-Bishops-Opening-4...h6-5.c3-d6"]
[UTCDate "2025.10.05"]
[UTCTime "21:02:28"]
[WhiteElo "266"]
[BlackElo "240"]
[TimeControl "900+10"]
[Termination "Game drawn by agreement"]
[StartTime "21:02:28"]
[EndDate "2025.10.05"]
[EndTime "21:09:51"]
[Link "https://www.chess.com/game/live/143946293404"]

1. e4 {[%clk 0:15:08.3]} 1... e5 {[%clk 0:15:06.9]} 2. Nf3 {[%clk 0:15:14.7]} 2... Nc6 {[%clk 0:15:11.7]} 3. Bc4 {[%clk 0:15:19.4]} 3... Nf6 {[%clk 0:15:10.4]} 4. d3 {[%clk 0:15:15.1]} 4... d6 {[%clk 0:15:17.6]} 5. c3 {[%clk 0:15:15.4]} 5... h6 {[%clk 0:15:23.5]} 6. Qe2 {[%clk 0:14:58.5]} 6... b5 {[%clk 0:15:16]} 7. Bxb5 {[%clk 0:15:01.9]} 7... Bd7 {[%clk 0:15:14.3]} 8. O-O {[%clk 0:14:47.3]} 8... g5 {[%clk 0:15:19.8]} 9. d4 {[%clk 0:14:35.5]} 9... a6 {[%clk 0:15:25.6]} 10. Ba4 {[%clk 0:14:27.4]} 10... Bg7 {[%clk 0:14:48.4]} 11. Nbd2 {[%clk 0:13:14.8]} 11... O-O {[%clk 0:14:54.4]} 12. Nc4 {[%clk 0:12:30]} 12... Be6 {[%clk 0:14:25.6]} 1/2-1/2
`,
  time_control: "900+10",
  end_time: 1759698591,
  rated: true,
  uuid: "9a06af91-a22e-11f0-ab68-2b25dc01000f",
  time_class: "rapid",
  rules: "chess",
  white: { rating: 266, result: "agreed", username: "Leny_l", uuid: "1dd19144-7619-11f0-b961-67b333845d7b" },
  black: { rating: 240, result: "agreed", username: "DubsTrubs", uuid: "d02285b8-4ee3-11f0-9e64-29f17220bdf5" },
  eco: "https://www.chess.com/openings/Italian-Game-Two-Knights-Modern-Bishops-Opening-4...h6-5.c3-d6",
};
