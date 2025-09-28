import { createContext, useContext, useMemo, useReducer } from 'react';
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
    case 'SET_AUTH':
      return { ...state, auth: action.payload };
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
    default:
      return state;
  }
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const api = useMemo(() => ({
    state,
    navigate: (key, params) => dispatch({ type: 'NAVIGATE', key, params }),
    setAuth: (payload) => dispatch({ type: 'SET_AUTH', payload }),
    credit: (amount) => dispatch({ type: 'CREDIT', amount }),
    debit: (amount) => dispatch({ type: 'DEBIT', amount }),
    placeBet: ({ group, figure, points, drawAt }) => dispatch({ type: 'PLACE_BET', payload: { group, figure, points, drawAt } }),
    postResult: async ({ group, figure, gifFile }) => {
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
    },
    groups: GROUPS,
  }), [state]);

  return (
    <AppStateContext.Provider value={api}>{children}</AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
