import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chatSoundsEnabledAtom } from "@/lib/atoms";
import { useChatSounds } from "@/hooks";

type Direction = "up" | "down" | "left" | "right";

type Cell = {
  x: number;
  y: number;
};

type SnakeGameProps = {
  onGameOver: () => void;
  onCancel: () => void;
};

const BOARD_SIZE = 18;
const TICK_MS = 120;

const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function randomFoodCell(snake: Cell[]): Cell {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const freeCells: Cell[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        freeCells.push({ x, y });
      }
    }
  }

  if (freeCells.length === 0) {
    return { x: 0, y: 0 };
  }

  const index = Math.floor(Math.random() * freeCells.length);
  return freeCells[index];
}

function nextHeadPosition(head: Cell, direction: Direction): Cell {
  switch (direction) {
    case "up":
      return { x: head.x, y: head.y - 1 };
    case "down":
      return { x: head.x, y: head.y + 1 };
    case "left":
      return { x: head.x - 1, y: head.y };
    case "right":
      return { x: head.x + 1, y: head.y };
  }
}

function isOutOfBounds(cell: Cell): boolean {
  return (
    cell.x < 0 || cell.y < 0 || cell.x >= BOARD_SIZE || cell.y >= BOARD_SIZE
  );
}

export function SnakeGame({ onGameOver, onCancel }: SnakeGameProps) {
  const soundsEnabled = useAtomValue(chatSoundsEnabledAtom);
  const { playChatStart, playToolUse, playError, playClick } =
    useChatSounds(soundsEnabled);
  const [snake, setSnake] = useState<Cell[]>([
    { x: 8, y: 9 },
    { x: 7, y: 9 },
    { x: 6, y: 9 },
  ]);
  const [direction, setDirection] = useState<Direction>("right");
  const directionRef = useRef<Direction>("right");
  const [food, setFood] = useState<Cell>({ x: 13, y: 9 });
  const foodRef = useRef<Cell>({ x: 13, y: 9 });
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const prevScoreRef = useRef(0);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    foodRef.current = food;
  }, [food]);

  useEffect(() => {
    playChatStart();
  }, [playChatStart]);

  useEffect(() => {
    if (score > prevScoreRef.current) {
      playToolUse();
    }
    prevScoreRef.current = score;
  }, [score, playToolUse]);

  useEffect(() => {
    if (!gameOver) return;
    playError();
  }, [gameOver, playError]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const nextDirection: Direction | null =
        key === "arrowup" || key === "w"
          ? "up"
          : key === "arrowdown" || key === "s"
            ? "down"
            : key === "arrowleft" || key === "a"
              ? "left"
              : key === "arrowright" || key === "d"
                ? "right"
                : null;

      if (!nextDirection) return;

      event.preventDefault();

      setDirection((current) => {
        if (OPPOSITE_DIRECTION[current] === nextDirection) {
          return current;
        }
        playClick();
        directionRef.current = nextDirection;
        return nextDirection;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playClick]);

  useEffect(() => {
    if (gameOver) return;

    const timer = window.setInterval(() => {
      setSnake((currentSnake) => {
        const head = currentSnake[0];
        const nextHead = nextHeadPosition(head, directionRef.current);
        const ateFood =
          nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y;

        const bodyToCheck = ateFood
          ? currentSnake
          : currentSnake.slice(0, currentSnake.length - 1);
        const collidedWithBody = bodyToCheck.some(
          (segment) => segment.x === nextHead.x && segment.y === nextHead.y
        );

        if (isOutOfBounds(nextHead) || collidedWithBody) {
          setGameOver(true);
          return currentSnake;
        }

        const nextSnake = [nextHead, ...currentSnake];
        if (!ateFood) {
          nextSnake.pop();
        } else {
          setScore((prev) => prev + 1);
          const nextFood = randomFoodCell(nextSnake);
          setFood(nextFood);
          foodRef.current = nextFood;
        }

        return nextSnake;
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [gameOver]);

  useEffect(() => {
    if (!gameOver) return;
    const timeout = window.setTimeout(() => {
      onGameOver();
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [gameOver, onGameOver]);

  const headKey = `${snake[0]?.x},${snake[0]?.y}`;
  const snakeCells = useMemo(
    () => new Set(snake.map((segment) => `${segment.x},${segment.y}`)),
    [snake]
  );
  const foodKey = `${food.x},${food.y}`;

  return (
    <div className="w-full max-w-none px-4 md:px-8 flex flex-col items-center gap-4 animate-in fade-in duration-200">
      <div className="w-full max-w-[980px] flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Snake</span>
          <span className="mx-2">•</span>
          <span>Score: {score}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <IconX size={14} className="mr-1" />
          Cancel game
        </Button>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-sm backdrop-blur-sm">
        <div
          className="grid rounded-xl overflow-hidden border border-border/40"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            width: "min(92vw, calc(100vh - 220px), 920px)",
            aspectRatio: "1 / 1",
          }}
        >
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
            const x = index % BOARD_SIZE;
            const y = Math.floor(index / BOARD_SIZE);
            const key = `${x},${y}`;
            const isHead = key === headKey;
            const isSnake = snakeCells.has(key);
            const isFood = key === foodKey;

            return (
              <div
                key={key}
                className={cn(
                  "border border-border/10",
                  isHead && "bg-primary",
                  !isHead && isSnake && "bg-primary/70",
                  isFood && "bg-red-500",
                  !isSnake && !isFood && "bg-muted/30"
                )}
              />
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Use arrow keys or WASD.
      </p>
      {gameOver && (
        <p className="text-sm font-medium text-destructive">
          Game over. Returning to your new chat...
        </p>
      )}
    </div>
  );
}
