// 实现这个项目的构建任务

const {
  src, dest, parallel, series, watch,
} = require('gulp');

const del = require('del');

const loadPlugins = require('gulp-load-plugins');
const autoprefixer = require('autoprefixer');

const plugins = loadPlugins();
const htmlmin = require('gulp-htmlmin');
const reporter = require('postcss-reporter');

const minimist = require('minimist');

const args = minimist(process.argv.slice(2));
const isProd = process.env.NODE_ENV ? process.env.NODE_ENV === 'production' : args.production || args.prod || false;

const browserSync = require('browser-sync');

const bs = browserSync.create();
const cwd = process.cwd();

const stylelint = require('stylelint');
const scss = require('postcss-scss');

const bsInit = {
  notify: false,
  port: args.port || 3000,
  open: args.open || false,
};

let config = {
  build: {
    src: 'src',
    dist: 'dist',
    temp: 'temp',
    public: 'public',
    paths: {
      styles: 'assets/styles/*.scss',
      scripts: 'assets/scripts/*.js',
      pages: '*.html',
      images: 'assets/images/**',
      fonts: 'assets/fonts/**',
    },
  },
};

try {
  const loadConfig = require(`${cwd}/pages.config.js`);
  config = { ...config, ...loadConfig };
// eslint-disable-next-line no-empty
} catch (e) {}

const clean = () => del([config.build.dist, config.build.temp]);

const style = () => src(config.build.paths.styles, {
  base: config.build.src,
  cwd: config.build.src,
  sourcemaps: !isProd,
})
  .pipe(plugins.sass({ outputStyle: 'expanded' }))
  .pipe(plugins.postcss([autoprefixer()]))
  .pipe(dest(config.build.temp))
  .pipe(bs.reload({ stream: true }));

const script = () => src(config.build.paths.scripts, {
  base: config.build.src,
  cwd: config.build.src,
  sourcemaps: !isProd,
})
  .pipe(plugins.babel({ presets: ['@babel/preset-env'] }))
  .pipe(dest(config.build.temp))
  .pipe(bs.reload({ stream: true }));

const page = () => src(config.build.paths.pages, { base: config.build.src, cwd: config.build.src })
  .pipe(plugins.swig({ data: config.data, defaults: { cache: false } }))
  .pipe(dest(config.build.temp))
  .pipe(bs.reload({ stream: true }));

const image = () => src(
  config.build.paths.images,
  { base: config.build.src, cwd: config.build.src },
)
  .pipe(plugins.imagemin())
  .pipe(dest(config.build.dist));

const font = () => src(config.build.paths.fonts, {
  base: config.build.src,
  cwd: config.build.src,
})
  .pipe(plugins.imagemin())
  .pipe(dest(config.build.dist));

const extra = () => src('**', { base: config.build.public, cwd: config.build.public }).pipe(
  dest(config.build.dist),
);

const stylesLint = () => src(
  config.build.paths.styles,
  {
    base: config.build.src,
    cwd: config.build.src,
  },
)
  .pipe(plugins.postcss([
    stylelint({ fix: args.fix }),
    reporter(),
  ],
  {
    syntax: scss,
  }));

const scriptsLint = () => src(
  config.build.paths.scripts,
  { base: config.build.src, cwd: config.build.src },
)
  .pipe(plugins.eslint({ fix: args.fix, debug: true }))
  .pipe(plugins.eslint.format())
  .pipe(dest((file) => file.base))
  .pipe(plugins.eslint.failAfterError());

const lint = parallel(stylesLint, scriptsLint);

const devServe = () => {
  // 当监视的文件数据变化后，将立即执行相应的命令并同步到 dist 目录中
  watch(config.build.paths.styles, { cwd: config.build.src }, style);
  watch(config.build.paths.scripts, { cwd: config.build.src }, script);
  watch(config.build.paths.pages, { cwd: config.build.src }, page);
  watch(
    [config.build.paths.images, config.build.paths.fonts],
    { cwd: config.build.src },
    bs.reload,
  );
  watch('**', { cwd: config.build.public }, bs.reload);

  bs.init({
    ...bsInit,
    server: {
      baseDir: [
        config.build.temp,
        config.build.dist,
        config.build.public,
        config.build.src,
      ],
      routes: {
        '/node_modules': 'node_modules',
      },
    },
  });
};

const prodServe = () => {
  bs.init({
    ...bsInit,
    server: {
      baseDir: config.build.dist,
    },
  });
};

const useref = () => src(
  config.build.paths.pages,
  { base: config.build.temp, cwd: config.build.temp },
)
  .pipe(plugins.useref({ searchPath: [config.build.temp, '.', '..'] }))
// html js css
  .pipe(plugins.if(/\.js$/, plugins.uglify()))
  .pipe(plugins.if(/\.css$/, plugins.cleanCss()))
  .pipe(plugins.if(/\.html$/, htmlmin({
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
  })))
  .pipe(dest(config.build.dist));

const publish = () => src('**', { base: config.build.dist, cwd: config.build.dist })
  .pipe(plugins.ghPages());

const compile = parallel(style, script, page);

const build = series(
  clean,
  parallel(
    series(compile, useref),
    image,
    font,
    extra,
  ),
);

const serve = series(compile, devServe);

const start = series(build, prodServe);

const deploy = series(build, publish);

module.exports = {
  clean,
  lint,
  serve,
  build,
  start,
  deploy,
};
