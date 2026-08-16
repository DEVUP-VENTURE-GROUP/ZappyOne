import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, RootState } from './index';

/** Typed `useDispatch` — thunks and RTK Query actions return their real type instead of `unknown`. */
export const useAppDispatch: () => AppDispatch = useDispatch;

/** Typed `useSelector` — the state argument is `RootState`, not `unknown`. */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
