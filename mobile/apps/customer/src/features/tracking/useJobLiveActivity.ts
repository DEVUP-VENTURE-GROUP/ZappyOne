// While a job is tracked on an iPhone, its card lives on the Lock Screen and Dynamic Island: started here, kept current by the server's pushes, ended when the job is over.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { liveActivity, type JobActivityState } from '@zappy/native';
import { useRegisterLiveActivityMutation } from '@zappy/core/api';

export function useJobLiveActivity({ id, title, reference, terminal, state }: { id: string; title: string; reference?: string | null; terminal: boolean; state?: JobActivityState | null }) {
  const [register] = useRegisterLiveActivityMutation();
  const on = Platform.OS === 'ios' && liveActivity.enabled();

  useEffect(() => {
    if (!on) return undefined;
    const sub = liveActivity.onToken((e) => { if (e.jobId === id) register({ id, token: e.token }).catch(() => {}); });
    return () => sub.remove();
  }, [on, id, register]);

  useEffect(() => {
    if (!on) return;
    if (terminal) { liveActivity.end(id); return; }
    if (state) liveActivity.start(id, title, reference || '', state);
  }, [on, id, title, reference, terminal, state?.stage]); // eslint-disable-line react-hooks/exhaustive-deps
}
