<template>
  <main class="app-shell">
    <header class="app-header">
      <h1>health-v2</h1>
      <nav>
        <RouterLink to="/upload">Upload</RouterLink>
        <RouterLink to="/sessions">Sessions</RouterLink>
        <RouterLink to="/recovery">Recovery</RouterLink>
      </nav>
    </header>
    <RouterView />
  </main>
</template>

<script setup lang="ts"></script>
