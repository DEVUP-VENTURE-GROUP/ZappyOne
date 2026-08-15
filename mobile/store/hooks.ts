import { useDispatch } from 'react-redux';
import type { AppDispatch } from './index';

/** Typed `useDispatch` — thunks and RTK Query actions return their real type instead of `unknown`. */
export const useAppDispatch: () => AppDispatch = useDispatch;
