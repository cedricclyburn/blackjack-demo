import { createRouter, createWebHistory } from 'vue-router'

const Home = () => import('./App.vue')
const Admin = () => import('./views/Admin.vue')

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/admin', name: 'admin', component: Admin },
  ],
})

export default router


