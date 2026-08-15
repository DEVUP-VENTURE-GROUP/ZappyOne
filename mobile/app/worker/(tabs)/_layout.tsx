import { Tabs } from 'expo-router';
import { Home, Briefcase, Wallet, User } from 'lucide-react-native';

export default function WorkerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F97316', // Zappy accent orange — worker app
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <Briefcase size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: ({ color }) => <Wallet size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
