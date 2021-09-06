// based on https://gist.github.com/straker/81b59eecf70da93af396f963596dfdc5
import type { NetlessApp } from "@netless/window-manager";
import styles from "./style.css?inline";

const grid = 15;

const canvasWidth = 750;
const canvasHeight = 585;

const paddleWidth = grid;
const paddleHeight = grid * 5;
const maxPaddleY = canvasHeight - grid - paddleHeight;
const paddleSpeed = 6;

const ballWidth = grid;
const ballHeight = grid;
const ballSpeed = 5;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function collides(obj1: Rect, obj2: Rect) {
  return (
    obj1.x < obj2.x + obj2.width &&
    obj1.x + obj1.width > obj2.x &&
    obj1.y < obj2.y + obj2.height &&
    obj1.y + obj1.height > obj2.y
  );
}

interface Paddle {
  x: number;
  y: number;
  dy: number;
  t: number;
}

interface Ball {
  x: number;
  y: number;
  resetting: boolean;
  dx: number;
  dy: number;
  t: number;
}

interface Player {
  memberId: number;
  t: number;
}

interface Attributes {
  leftPlayer?: Player;
  rightPlayer?: Player;
  leftPaddle?: Paddle;
  rightPaddle?: Paddle;
  ball?: Ball;
}

const Pong: NetlessApp<Attributes> = {
  kind: "Pong",
  config: {
    minwidth: 200,
    minheight: 200,
  },
  setup(context) {
    let room = context.getRoom();
    if (!room) {
      context.emitter.emit("destroy", {
        error: new Error(`Pong can not be played without room`),
      });
      return;
    }

    let box = context.getBox();
    if (!box) {
      context.emitter.emit("destroy", {
        error: new Error(`no box`),
      });
      return;
    }

    function getName(memberId: number) {
      if (!memberId || !room) return;
      const maybeUser = room.state.roomMembers.find(e => e.memberId === memberId);
      if (!maybeUser) return;
      return ((maybeUser?.payload?.cursorName as string) || "") + "#" + memberId;
    }

    box.mountStyles(styles);

    const container = document.createElement("div");
    container.dataset.kind = "pong";
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 1;
    canvas.style.outline = "none";

    function makeTip(text: string) {
      const el = document.createElement("div");
      el.classList.add("tip");
      el.textContent = text;
      el.style.visibility = "hidden";
      let tipVisible = false;
      const showTip = () => {
        if (!tipVisible) {
          el.style.visibility = "visible";
          tipVisible = true;
        }
      };
      const hideTip = () => {
        if (tipVisible) {
          el.style.visibility = "hidden";
          tipVisible = false;
        }
      };
      return { el, showTip, hideTip };
    }

    const tip1 = makeTip("press ← or → to insert coin");
    const tip2 = makeTip("wait for the other, press [x] to exit");

    const resizeObserver = new ResizeObserver(es => {
      if (es[0]?.contentRect) {
        const { width, height } = es[0]?.contentRect;
        requestAnimationFrame(() => {
          canvas.width = width - 8;
          canvas.height = height - 8;
        });
      }
    });
    resizeObserver.observe(container);
    container.append(canvas);
    container.append(tip1.el);
    container.append(tip2.el);
    box.mountContent(container);

    let ctx = canvas.getContext("2d")!;
    let state: Required<Attributes> = JSON.parse(JSON.stringify(context.getAttributes() || {}));
    let side: "left" | "right" | undefined;

    state.leftPlayer = state.leftPlayer || {
      memberId: 0,
      t: 0,
    };

    if (state.leftPlayer.memberId === room.observerId) {
      side = "left";
    }

    state.rightPlayer = state.rightPlayer || {
      memberId: 0,
      t: 0,
    };

    if (!side && state.rightPlayer.memberId === room.observerId) {
      side = "right";
    }

    state.leftPaddle = state.leftPaddle || {
      x: grid * 2,
      y: canvasHeight / 2 - paddleHeight / 2,
      dy: 0,
      t: room.calibrationTimestamp,
    };

    state.rightPaddle = state.rightPaddle || {
      x: canvasWidth - grid * 3,
      y: canvasHeight / 2 - paddleHeight / 2,
      dy: 0,
      t: room.calibrationTimestamp,
    };

    state.ball = state.ball || {
      x: canvasWidth / 2,
      y: canvasHeight / 2,
      resetting: false,
      dx: ballSpeed,
      dy: -ballSpeed,
    };

    function loop(dt: number) {
      requestAnimationFrame(loop);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scaleX = canvas.width / canvasWidth;
      const scaleY = canvas.height / canvasHeight;

      // draw walls
      ctx.fillStyle = "lightgrey";
      ctx.fillRect(0, 0, canvas.width, grid * scaleY);
      ctx.fillRect(0, canvas.height - grid * scaleY, canvas.width, canvas.height);

      // draw dotted line down the middle
      for (let i = grid * scaleY; i < canvas.height - grid * scaleY; i += grid * scaleY * 2) {
        ctx.fillRect(canvas.width / 2 - (grid * scaleX) / 2, i, grid * scaleX, grid * scaleY);
      }

      const members = new Set((room?.state.roomMembers || []).map(e => e.memberId));
      if (state.leftPlayer.memberId && !members.has(state.leftPlayer.memberId)) {
        context.updateAttributes(["leftPlayer"], <Player>{ memberId: 0, t: 0 });
        return;
      }
      if (state.rightPlayer.memberId && !members.has(state.rightPlayer.memberId)) {
        context.updateAttributes(["rightPlayer"], <Player>{ memberId: 0, t: 0 });
        return;
      }

      // draw player name
      const textY = grid * scaleY * 2 + 8;
      const leftName = getName(state.leftPlayer.memberId);
      leftName && ctx.fillText(leftName, 8, textY);
      const rightName = getName(state.rightPlayer.memberId);
      rightName && ctx.fillText(rightName, canvas.width / 2 + (grid * scaleY) / 2 + 8, textY);

      if (!side) {
        tip2.hideTip();
        tip1.showTip();
        return;
      }
      tip1.hideTip();

      if (!(side === "left" ? rightName : leftName)) {
        tip2.showTip();
        return;
      }
      tip2.hideTip();

      let { leftPaddle, rightPaddle } = state;
      leftPaddle.y += leftPaddle.dy;
      rightPaddle.y += rightPaddle.dy;
      if (leftPaddle.y < grid) {
        leftPaddle.y = grid;
      } else if (leftPaddle.y > maxPaddleY) {
        leftPaddle.y = maxPaddleY;
      }
      if (rightPaddle.y < grid) {
        rightPaddle.y = grid;
      } else if (rightPaddle.y > maxPaddleY) {
        rightPaddle.y = maxPaddleY;
      }

      // draw paddles
      ctx.fillStyle = "white";
      ctx.fillRect(
        leftPaddle.x * scaleX,
        leftPaddle.y * scaleY,
        paddleWidth * scaleX,
        paddleHeight * scaleY
      );
      ctx.fillRect(
        rightPaddle.x * scaleX,
        rightPaddle.y * scaleY,
        paddleWidth * scaleX,
        paddleHeight * scaleY
      );

      let { ball } = state;
      ball.x += ball.dx;
      ball.y += ball.dy;

      if (ball.y < grid) {
        ball.y = grid;
        ball.dy *= -1;
        ball.t = room!.calibrationTimestamp;
        context.updateAttributes(["ball"], ball);
      } else if (ball.y + grid > canvasHeight - grid) {
        ball.y = canvasHeight - grid * 2;
        ball.dy *= -1;
        ball.t = room!.calibrationTimestamp;
        context.updateAttributes(["ball"], ball);
      }

      // reset ball if it goes past paddle (but only if we haven't already done so)
      if ((ball.x < 0 || ball.x > canvasWidth) && !ball.resetting) {
        ball.resetting = true;

        // give some time for the player to recover before launching the ball again
        setTimeout(() => {
          ball.resetting = false;
          ball.x = canvasWidth / 2;
          ball.y = canvasHeight / 2;
          ball.t = room!.calibrationTimestamp;
          context.updateAttributes(["ball"], ball);
        }, 400);
      }

      // check to see if ball collides with paddle. if they do change x velocity
      const ballRect = { ...ball, width: grid, height: grid };
      const leftPaddleRect = { ...leftPaddle, width: paddleWidth, height: paddleHeight };
      const rightPaddleRect = { ...rightPaddle, width: paddleWidth, height: paddleHeight };
      if (collides(ballRect, leftPaddleRect)) {
        ball.dx *= -1;
        ball.x = leftPaddle.x + paddleWidth;
        ball.t = room!.calibrationTimestamp;
        context.updateAttributes(["ball"], ball);
      } else if (collides(ballRect, rightPaddleRect)) {
        ball.dx *= -1;
        ball.x = rightPaddle.x - grid;
        ball.t = room!.calibrationTimestamp;
        context.updateAttributes(["ball"], ball);
      }

      // draw ball
      ctx.fillRect(ball.x * scaleX, ball.y * scaleY, grid * scaleX, grid * scaleY);
    }

    canvas.addEventListener("keydown", e => {
      if (side) {
        let paddle = side === "left" ? state.leftPaddle : state.rightPaddle;
        if (e.key === "ArrowUp") {
          context.updateAttributes([side + "Paddle"], <Paddle>{
            x: paddle.x,
            y: paddle.y,
            dy: -paddleSpeed,
            t: room!.calibrationTimestamp,
          });
        } else if (e.key === "ArrowDown") {
          context.updateAttributes([side + "Paddle"], <Paddle>{
            x: paddle.x,
            y: paddle.y,
            dy: paddleSpeed,
            t: room!.calibrationTimestamp,
          });
        }
      }
    });

    canvas.addEventListener("keyup", e => {
      if (side) {
        let paddle = side === "left" ? state.leftPaddle : state.rightPaddle;
        if (e.key === "ArrowUp") {
          context.updateAttributes([side + "Paddle"], <Paddle>{
            x: paddle.x,
            y: paddle.y,
            dy: 0,
            t: room!.calibrationTimestamp,
          });
        } else if (e.key === "ArrowDown") {
          context.updateAttributes([side + "Paddle"], <Paddle>{
            x: paddle.x,
            y: paddle.y,
            dy: 0,
            t: room!.calibrationTimestamp,
          });
        } else if (e.key === "x") {
          context.updateAttributes([side + "Player"], <Player>{ memberId: 0, t: 0 });
          side = undefined;
        }
      } else {
        if (e.key === "ArrowLeft") {
          if (state.leftPlayer.memberId) return;
          side = "left";
          context.updateAttributes(["leftPlayer"], <Player>{
            memberId: room!.observerId,
            t: room!.calibrationTimestamp,
          });
        } else if (e.key === "ArrowRight") {
          if (state.rightPlayer.memberId) return;
          side = "right";
          context.updateAttributes(["rightPlayer"], <Player>{
            memberId: room!.observerId,
            t: room!.calibrationTimestamp,
          });
        }
      }
    });

    context.emitter.on("attributesUpdate", attrs => {
      if (!attrs) return;
      for (const key of Object.keys(state)) {
        if (attrs[key as keyof Attributes]) {
          state[key as keyof Attributes] = JSON.parse(
            JSON.stringify(attrs[key as keyof Attributes])
          );
        }
      }
    });

    let handle = requestAnimationFrame(loop);
    context.emitter.on("destroy", () => {
      cancelAnimationFrame(handle);
      resizeObserver.disconnect();
    });
  },
};

export default Pong;
