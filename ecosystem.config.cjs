module.exports = {
  apps: [
    {
      name: "market-sentiment-dashboard",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
