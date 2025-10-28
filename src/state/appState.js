import { createContext, useContext, useMemo, useReducer, useCallback, useEffect } from 'react';
import { GROUPS } from '../config/gameRules';

const initialState = {
  screen: { key: 'welcome', params: {} }, // 'welcome' | 'login' | 'dashboard' | 'board' | 'confirm' | 'history' | 'withdrawSetup' | 'invite'
  auth: null, // { telegramId, name, contact, status }
  wallet: { balance: 1000 },
  walletTxns: [], // { id, type: 'credit'|'debit'|'bet'|'win'|'refund', amount, balanceAfter, note?, createdAt }
  bets: [],
  results: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, screen: { key: action.key, params: action.params || {} } };
    case 'SET_AUTH': {
      const payload = action.payload;
      if (payload == null) {
        return { ...state, auth: null };
      }
      const replace = action.options?.replace;
      const current = replace ? {} : (state.auth || {});
      return { ...state, auth: { ...current, ...payload } };
    }
    case 'CREDIT': {
      const balance = state.wallet.balance + action.amount;
      const txn = {
        id: 'txn_' + (state.walletTxns.length + 1),
        type: 'credit',
        amount: action.amount,
        balanceAfter: balance,
        note: action.note || 'manual credit',
        createdAt: new Date().toISOString(),
      };
      return { ...state, wallet: { balance }, walletTxns: [txn, ...state.walletTxns] };
    }
    case 'DEBIT': {
      const amount = Math.max(0, action.amount);
      const balance = Math.max(0, state.wallet.balance - amount);
      const txn = {
        id: 'txn_' + (state.walletTxns.length + 1),
        type: 'debit',
        amount,
        balanceAfter: balance,
        note: action.note || 'manual debit',
        createdAt: new Date().toISOString(),
      };
      return { ...state, wallet: { balance }, walletTxns: [txn, ...state.walletTxns] };
    }
    case 'PLACE_BET': {
      const { group, figure, points, drawAt } = action.payload;
      const newBet = {
        id: 'bet_' + (state.bets.length + 1),
        group,
        figure,
        points,
        status: 'placed',
        drawAt,
        createdAt: new Date().toISOString(),
      };
      const newBalance = Math.max(0, state.wallet.balance - points);
      const betTxn = {
        id: 'txn_' + (state.walletTxns.length + 1),
        type: 'bet',
        amount: points,
        balanceAfter: newBalance,
        note: `Bet on ${group}#${figure}`,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        bets: [newBet, ...state.bets],
        wallet: { balance: newBalance },
        walletTxns: [betTxn, ...state.walletTxns],
      };
    }
    case 'POST_RESULT': {
      const { group, figure, mediaName, mediaSize, mediaType, mediaUrl, postedAt } = action.payload;
      const entry = {
        id: 'result_' + (state.results.length + 1),
        group,
        figure,
        media: {
          name: mediaName || null,
          size: mediaSize || 0,
          type: mediaType || null,
          url: mediaUrl || null,
        },
        postedAt: postedAt || new Date().toISOString(),
      };
      return { ...state, results: [entry, ...state.results] };
    }
    case 'SET_WALLET_DATA': {
      const payload = action.payload || {};
      const walletInput = payload.wallet ?? action.wallet ?? null;
      const txnsInput = payload.txns ?? action.txns;
      const betsInput = payload.bets ?? action.bets;
      const nextWallet = walletInput
        ? { ...walletInput, balance: Number(walletInput.balance ?? 0) }
        : state.wallet;
      const nextTxns = Array.isArray(txnsInput)
        ? txnsInput.map((txn) => ({ ...txn }))
        : state.walletTxns;
      const nextBets = Array.isArray(betsInput)
        ? betsInput.map((bet) => ({ ...bet }))
        : state.bets;
      return {
        ...state,
        wallet: nextWallet,
        walletTxns: nextTxns,
        bets: nextBets,
      };
    }
    default:
      return state;
  }
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Bootstrap auth from Telegram initData -> /api/whoami
  useEffect(() => {
    try {
      const initData = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
      if (!initData) {
        // No Telegram context available; leave auth as-is
        return;
      }
      (async () => {
        let resp;
        try {
          resp = await fetch('/api/whoami', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `tma ${initData}`,
            },
            body: '{}',
          });
        } catch {
          return;
        }
        let data = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }
        if (resp.ok && data && data.ok && data.userId) {
          const u = data.user || {};
          const displayName = u.first_name || u.username || u.last_name || 'User';
          dispatch({
            type: 'SET_AUTH',
            payload: {
              telegramId: String(data.userId),
              name: displayName,
              status: 'verified',
              isAdmin: !!data.isAdmin,
            },
            options: { replace: true },
          });
        } else {
          // Explicitly clear auth on invalid verification
          dispatch({ type: 'SET_AUTH', payload: null });
        }
      })();
    } catch {
      // Swallow errors to avoid breaking render on mount
    }
  }, []);

  const navigate = useCallback((key, params) => dispatch({ type: 'NAVIGATE', key, params }), []);
  const setAuth = useCallback((payload, options) => dispatch({ type: 'SET_AUTH', payload, options }), []);
  const credit = useCallback((amount) => dispatch({ type: 'CREDIT', amount }), []);
  const debit = useCallback((amount) => dispatch({ type: 'DEBIT', amount }), []);
  const placeBet = useCallback(
    ({ group, figure, points, drawAt }) => dispatch({ type: 'PLACE_BET', payload: { group, figure, points, drawAt } }),
    [],
  );
  const setWalletData = useCallback(({ wallet, txns, bets }) => dispatch({ type: 'SET_WALLET_DATA', payload: { wallet, txns, bets } }), []);
  const postResult = useCallback(async ({ group, figure, gifFile }) => {
    const postedAt = new Date().toISOString();
    const mediaName = gifFile?.name || null;
    const mediaSize = gifFile?.size || 0;
    const mediaType = gifFile?.type || null;
    let mediaUrl = null;
    if (gifFile && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        mediaUrl = URL.createObjectURL(gifFile);
      } catch (_) {
        mediaUrl = null;
      }
    }
    console.log('[postResult]', { group, figure, mediaName, mediaSize, mediaType, mediaUrl, postedAt });
    dispatch({
      type: 'POST_RESULT',
      payload: { group, figure, mediaName, mediaSize, mediaType, mediaUrl, postedAt },
    });
    return { group, figure, mediaName, mediaSize, mediaType, mediaUrl, postedAt };
  }, []);

  const api = useMemo(() => ({
    state,
    navigate,
    setAuth,
    credit,
    debit,
    placeBet,
    setWalletData,
    postResult,
    groups: GROUPS,
  }), [state, navigate, setAuth, credit, debit, placeBet, setWalletData, postResult]);

  return (
    <AppStateContext.Provider value={api}>{children}</AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
