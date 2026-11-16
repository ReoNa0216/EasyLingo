module.exports = {
      theme: {
        extend: {
          fontFamily: {
            display: ['Inter Variable', 'Noto Sans SC Variable', 'Noto Sans JP Variable', 'sans-serif'],
            body: ['Inter Variable', 'Noto Sans SC Variable', 'Noto Sans JP Variable', 'sans-serif'],
          },
          colors: {
            primary: {
              50: '#faf8fc',
              100: '#ede6f3',
              200: '#ddd1e7',
              300: '#c2afd3',
              400: '#a18ab5',
              500: '#79658c',
              600: '#665078',
              700: '#523e63',
              800: '#422f52',
              900: '#2f243b',
            },
            accent: {
              50: '#f5f0fb',
              100: '#eae1f5',
              200: '#dacbee',
              300: '#c1a9df',
              400: '#a387c9',
              500: '#7b5aa3',
              600: '#5f479a',
              700: '#503880',
              800: '#422256',
              900: '#33203f',
            }
          }
        }
      }
    };
module.exports.content = ["./src/*.html", "./src/*.js"];
