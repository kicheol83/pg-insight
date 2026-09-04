import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
} from "react";
import { io, Socket } from "socket.io-client";

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface RealtimeConnections {
  total: number;
  active: number;
  idleInTransaction: number;
  utilizationPct: number;
  timestamp: string;
}

interface AppState {
  wsStatus: WsStatus;
  activeTargetId: string | null;
  realtimeConnections: Record<string, RealtimeConnections>;
  activeAlertsCount: number;
}

type Action =
  | { type: "SET_WS_STATUS"; payload: WsStatus }
  | { type: "SET_ACTIVE_TARGET"; payload: string | null }
  | {
      type: "SET_RT_CONNECTIONS";
      targetId: string;
      payload: RealtimeConnections;
    }
  | { type: "SET_ACTIVE_ALERTS"; payload: number };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_WS_STATUS":
      return { ...state, wsStatus: action.payload };
    case "SET_ACTIVE_TARGET":
      if (typeof window !== "undefined") {
        if (action.payload)
          localStorage.setItem(ACTIVE_TARGET_KEY, action.payload);
        else localStorage.removeItem(ACTIVE_TARGET_KEY);
      }
      return { ...state, activeTargetId: action.payload };
    case "SET_RT_CONNECTIONS":
      return {
        ...state,
        realtimeConnections: {
          ...state.realtimeConnections,
          [action.targetId]: action.payload,
        },
      };
    case "SET_ACTIVE_ALERTS":
      return { ...state, activeAlertsCount: action.payload };
    default:
      return state;
  }
}

interface AppCtx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  subscribeToTarget: (targetId: string) => void;
  unsubscribeFromTarget: (targetId: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);

const ACTIVE_TARGET_KEY = "pg-insight-active-target";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    wsStatus: "connecting",

    activeTargetId:
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_TARGET_KEY)
        : null,
    realtimeConnections: {},
    activeAlertsCount: 0,
  });

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socketUrl = import.meta.env.DEV
      ? "http://localhost:3000/metrics"
      : "/metrics";

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () =>
      dispatch({ type: "SET_WS_STATUS", payload: "connected" }),
    );
    socket.on("disconnect", () =>
      dispatch({ type: "SET_WS_STATUS", payload: "disconnected" }),
    );
    socket.on("connect_error", () =>
      dispatch({ type: "SET_WS_STATUS", payload: "error" }),
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  const subscribeToTarget = (targetId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("subscribe", { targetId });
    socket.on("connections", (data: RealtimeConnections) => {
      dispatch({ type: "SET_RT_CONNECTIONS", targetId, payload: data });
    });
  };

  const unsubscribeFromTarget = (targetId: string) => {
    socketRef.current?.emit("unsubscribe", { targetId });
  };

  return (
    <Ctx.Provider
      value={{ state, dispatch, subscribeToTarget, unsubscribeFromTarget }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore must be inside AppProvider");
  return ctx;
}

export function useActiveTarget() {
  const { state, dispatch } = useAppStore();
  return {
    activeTargetId: state.activeTargetId,
    setActiveTarget: (id: string | null) =>
      dispatch({ type: "SET_ACTIVE_TARGET", payload: id }),
  };
}
