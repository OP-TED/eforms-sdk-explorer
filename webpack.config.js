module.exports = {
    entry: './src/js/script.js', // Replace with the path to your main JS file
    output: {
      filename: 'bundle.js',
      path: __dirname + '/dist', // The bundled JS will be output to the /dist directory
    },
    mode: 'development',
  };