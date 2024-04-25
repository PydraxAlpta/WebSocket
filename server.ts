import { contentType } from "deno:media_types";
import { extname } from "deno:path";

const PORT = 80;
const staticDir = "./public";

Deno.serve({
  port: PORT,
  handler: async (request: Request) => {
    if (request.headers.get("upgrade") === "websocket") {
      return handleWebSocket(request);
    } else {
      const url = new URL(request.url, `http://localhost:${PORT}`);
      let filePath = `${staticDir}${url.pathname}`;
      if (filePath.endsWith("/")) {
        filePath = filePath + "index.html";
      }
      try {
        const fileInfo = await Deno.stat(filePath);
        if (fileInfo.isFile) {
          const file = await Deno.open(filePath);
          const headers = new Headers({
            "Content-Length": fileInfo.size.toString(),
            "Content-Type":
              contentType(extname(filePath)) || "application/octet-stream",
          });

          return new Response(file.readable, { headers });
        } else {
          return new Response("Not Found", {
            status: 404,
            statusText: "Not found",
          });
        }
      } catch (error) {
        console.error("Error serving file:", error);
        return new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }
    }
  },
});

class Lobby {
  firstId?: string;
  secondId?: string;
  state: "waiting" | "full" | "ended";
  constructor(firstId: string) {
    this.state = "waiting";
    this.firstId = firstId;
  }
  connect(secondId: string) {
    if (this.state === "full") {
      throw Error("Lobby is full");
    } else if (this.state === "ended") {
      throw Error("Lobby has ended");
    }
    this.secondId = secondId;
    this.state = "full";
  }
  disconnect() {
    this.state = "ended";
    this.firstId = this.secondId = undefined;
  }
}

let lobbies: Array<Lobby> = [];
const id_socket_map: Record<string, WebSocket> = {};

function handleWebSocket(request: Request) {
  const { socket, response } = Deno.upgradeWebSocket(request);
  socket.addEventListener("open", () => {
    console.log("CONNECTED");
    const clientId = crypto.randomUUID();
    console.log("Client ID:", clientId);
    socket.send(JSON.stringify({ clientId }));
    id_socket_map[clientId] = socket;
  });
  socket.addEventListener("close", () => {
    console.log("DISCONNECTED");
    let clientId;
    for (const id in id_socket_map) {
      if (id_socket_map[id] === socket) {
        delete id_socket_map[id];
        clientId = id;
        break;
      }
    }
    for (const lobby of lobbies) {
      if (lobby.firstId === clientId) {
        const opponentSocket = lobby.secondId
          ? id_socket_map[lobby.secondId]
          : undefined;
        opponentSocket?.close(1, "OPPONENT DISCONNECTED");
        lobby.disconnect();
      } else if (lobby.secondId === clientId) {
        const opponentSocket = lobby.firstId
          ? id_socket_map[lobby.firstId]
          : undefined;
        opponentSocket?.close(1, "OPPONENT DISCONNECTED");
        lobby.disconnect();
      }
    }
  });
  socket.addEventListener("error", (err) => {
    console.error("ERROR:", err);
  });
  socket.addEventListener("message", (event) => {
    console.log("RECIEVED:", event.data);
    const { message, id: clientId } = JSON.parse(event.data);
    if (message) {
      if (message.action === "START") {
        handleStart(clientId, socket);
      } else if (message.action === "TURN") {
        handleTurn(clientId, message.index, message.turn);
      }
    }
  });
  return response;
}

function handleStart(clientId: string, socket: WebSocket) {
  let lobby = lobbies.find((lobby) => lobby.state === "waiting");
  if (lobby) {
    lobby.connect(clientId);
    startGame(lobby.firstId, lobby.secondId);
  } else {
    lobby = new Lobby(clientId);
    lobbies.push(lobby);
    socket.send(JSON.stringify({ state: "WAIT" }));
  }
}

function handleTurn(clientId: string, index: number, turn: "cross" | "nought") {
  const lobby = lobbies.find(
    (l) =>
      (l.state === "full" && l.firstId === clientId) || l.secondId === clientId
  );
  if (lobby) {
    const opponentId =
      lobby.firstId === clientId ? lobby.secondId : lobby.firstId;
    const nextTurn = turn === "cross" ? "naught" : "cross";
    const payload = JSON.stringify({ turn: nextTurn, index });
    const playerSocket = id_socket_map[clientId];
    const opponentSocket = id_socket_map[opponentId!];
    playerSocket.send(payload);
    opponentSocket.send(payload);
  } else {
    console.error("NO LOBBY FOR", clientId);
  }
}

function cleanupLobbies() {
  lobbies = lobbies.filter((lobby) => lobby.state !== "ended");
}

setInterval(cleanupLobbies, 10000);

function startGame(firstId?: string, secondId?: string) {
  if (!firstId || !secondId) {
    return;
  }
  const toss = Math.random() > 0.5;
  let cross: string, naught: string;
  if (toss) {
    [cross, naught] = [firstId, secondId];
  } else {
    [naught, cross] = [firstId, secondId];
  }
  id_socket_map[cross].send(JSON.stringify({ state: "START", side: "cross" }));
  id_socket_map[naught].send(
    JSON.stringify({ state: "START", side: "naught" })
  );
}
