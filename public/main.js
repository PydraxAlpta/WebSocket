const board = document.getElementById("board");
const loader = document.getElementById("loader");
const playButton = document.getElementById("play-button");
const output = document.getElementById("output");
const cells = document.querySelectorAll(".cell");
const wsUri = "ws://127.0.0.1";
const ws = new WebSocket(wsUri);
let state = "home";
let side;
let turn;
function setState(newState, data) {
  state = newState;
  if (state === "lobby") {
    loader.classList.remove("hidden");
    playButton.classList.add("hidden");
    sendMessage({ action: "START" });
  } else if (state === "playing") {
    side = data.side;
    board.classList.remove("hidden");
    loader.classList.add("hidden");
    turn = "cross";
    performTurn();
  } else if (state === "won") {
    handleEnd(data.index);
    output.innerText = "You Win!!";
  } else if (state === "drawn") {
    handleEnd(data.index);
    output.innerText = "It's a draw.";
  } else if (state === "lost") {
    handleEnd(data.index);
    output.innerText = "You Lost..";
  }
}

function handleEnd(index) {
  playCell(index);
  turn = undefined;
  performTurn();
}

function performTurn() {
  if (turn === side) {
    board.classList.remove("blocked");
    cells.forEach((cell) => {
      cell.removeAttribute("disabled");
    });
    loader.classList.add("hidden");
  } else {
    board.classList.add("blocked");
    cells.forEach((cell) => {
      cell.setAttribute("disabled", "");
    });
    loader.classList.remove("hidden");
  }
}

cells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    if (cell.classList.contains("cross") || cell.classList.contains("nought")) {
      return;
    }
    sendMessage({ action: "TURN", index, turn });
  });
});

function playCell(index) {
  cells[index].classList.add(turn);
}

playButton?.addEventListener("click", () => {
  setState("lobby");
});

let myId;
const sendMessage = (message) => {
  ws.send(JSON.stringify({ id: myId, message }));
};

ws.addEventListener("open", () => {});
ws.addEventListener("close", () => {
  myId = undefined;
});
ws.addEventListener("message", (event) => {
  console.log(`RECEIVED: ${event.data}`);
  const data = JSON.parse(event.data);
  if (data.clientId) {
    myId = data.clientId;
  } else if (data.state) {
    if (data.state === "WAIT") {
      setState("waiting");
    } else if (data.state === "START") {
      setState("playing", data);
    } else if (data.state === "WIN") {
      setState("won", data);
    } else if (data.state === "LOSS") {
      setState("lost", data);
    } else if (data.state === "DRAW") {
      setState("drawn", data);
    }
  } else if (data.turn) {
    playCell(data.index);
    turn = data.turn;
    performTurn();
  }
});
ws.addEventListener("error", (err) => {
  console.error(`ERROR:${err}`);
});
