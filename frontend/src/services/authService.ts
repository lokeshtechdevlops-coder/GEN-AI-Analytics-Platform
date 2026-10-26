import api from './api';

export interface UserProfile {
  authenticated: boolean;
  user_id: string;
  name: string;
  email: string;
  roles: string[];
  scope: string[];
  session_id: string;
  login_time: string;
  source: string;
}

export const fetchCurrentUser = async (): Promise<UserProfile> => {
  const res = await api.get<UserProfile>('/auth/me');
  return res.data;
};

export const logoutUser = async (): Promise<void> => {
  await api.post('/auth/logout');
};

export default {
  fetchCurrentUser,
  logoutUser,
};
