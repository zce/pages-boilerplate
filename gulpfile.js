const gulp = require('gulp')
const gulpLoadPlugins = require('gulp-load-plugins')

const minimist = require('minimist')

const del = require('del')
const Comb = require('csscomb')
const standard = require('standard')
const browserSync = require('browser-sync')
const autoprefixer = require('autoprefixer')
const cssnano = require('cssnano')

const pkg = require('./package')

const $ = gulpLoadPlugins()
const bs = browserSync.create()
const argv = minimist(process.argv.slice(2))
// TODO: production
const isProd = process.env.NODE_ENV === 'production'

const config = {
  src: 'src',
  dest: 'dist',
  public: 'public',
  temp: 'temp'
}

const data = {
  name: pkg.name,
  version: pkg.version,
  homepage: pkg.homepage,
  author: pkg.author,
  date: new Date()
}

const paths = {
  pages: '**/*.html',
  styles: 'assets/styles/**/*.scss',
  scripts: 'assets/scripts/**/*.js',
  images: 'assets/images/**/*.{jpg,jpeg,png,gif,svg}',
  fonts: 'assets/fonts/**/*.{eot,svg,ttf,woff,woff2}'
}

const clean = () => {
  return del([ config.temp, config.dest ])
}

const lint = done => {
  const comb = new Comb(require('./.csscomb.json'))
  comb.processPath(config.src)
  standard.lintFiles(paths.scripts, { cwd: config.src, fix: true }, done)
}

const style = () => {
  return gulp.src(paths.styles, { cwd: config.src, base: config.src, sourcemaps: !isProd })
    .pipe($.plumber({ errorHandler: $.sass.logError }))
    .pipe($.sass.sync({ outputStyle: 'expanded', precision: 10, includePaths: ['.'] }))
    .pipe($.postcss([ autoprefixer() ]))
    .pipe(gulp.dest(config.temp, { sourcemaps: '.' }))
    .pipe(bs.reload({ stream: true }))
}

const script = () => {
  return gulp.src(paths.scripts, { cwd: config.src, base: config.src, sourcemaps: !isProd })
    .pipe($.plumber())
    .pipe($.babel())
    .pipe(gulp.dest(config.temp, { sourcemaps: '.' }))
    .pipe(bs.reload({ stream: true }))
}

const page = () => {
  return gulp.src(paths.pages, { cwd: config.src, base: config.src, ignore: [ '{layouts,partials}/**' ] })
    .pipe($.plumber())
    .pipe($.swig({ data: { site: data } }))
    .pipe(gulp.dest(config.temp))
    // use bs-html-injector
    // .pipe(bs.reload({ stream: true }))
}

const useref = () => {
  return gulp.src(paths.pages, { cwd: config.temp, base: config.temp })
    .pipe($.plumber())
    .pipe($.useref({ searchPath: [ config.temp, config.src, '.' ] }))
    .pipe($.if(/\.js$/, $.uglify({ compress: { drop_console: true } })))
    .pipe($.if(/\.css$/, $.postcss([ cssnano({ safe: true, autoprefixer: false }) ])))
    .pipe($.if(/\.html$/, $.htmlmin({
      collapseWhitespace: true,
      minifyCSS: true,
      minifyJS: { compress: { drop_console: true } },
      processConditionalComments: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true
    })))
    .pipe(gulp.dest(config.dest))
}

const image = () => {
  return gulp.src(paths.images, { cwd: config.src, base: config.src, since: gulp.lastRun(image) })
    .pipe($.plumber())
    .pipe($.imagemin())
    .pipe(gulp.dest(config.dest))
}

const font = () => {
  return gulp.src(paths.fonts, { cwd: config.src, base: config.src })
    .pipe($.plumber())
    .pipe($.imagemin())
    .pipe(gulp.dest(config.dest))
}

const extra = () => {
  return gulp.src('**', { cwd: config.public, base: config.public, dot: true })
    .pipe(gulp.dest(config.dest))
}

const measure = () => {
  return gulp.src('**', { cwd: config.dest })
    .pipe($.plumber())
    .pipe($.size({ title: 'build', gzip: true }))
}

const upload = () => {
  return gulp.src('**', { cwd: config.dest })
    .pipe($.plumber())
    .pipe($.ghPages({
      cacheDir: `${config.temp}/publish`,
      branch: argv.branch === undefined ? 'gh-pages' : argv.branch
    }))
}

const devServer = () => {
  gulp.watch(paths.styles, { cwd: config.src }, style)
  gulp.watch(paths.scripts, { cwd: config.src }, script)
  gulp.watch(paths.pages, { cwd: config.src }, page)
  gulp.watch([ paths.images, paths.fonts ], { cwd: config.src }, bs.reload)
  gulp.watch('**', { cwd: config.public }, bs.reload)

  bs.init({
    notify: false,
    port: argv.port === undefined ? 2080 : argv.port,
    open: argv.open === undefined ? true : argv.open,
    plugins: [ `bs-html-injector?files[]=${config.temp}/*.html` ],
    server: {
      baseDir: [ config.temp, config.src, config.public ],
      routes: { '/node_modules': 'node_modules' }
    }
  })
}

const distServer = () => {
  bs.init({
    notify: false,
    port: argv.port === undefined ? 2080 : argv.port,
    open: argv.open === undefined ? true : argv.open,
    server: config.dest
  })
}

const compile = gulp.parallel(style, script, page)

const serve = gulp.series(compile, devServer)

const build = gulp.series(clean, gulp.parallel(gulp.series(compile, useref), image, font, extra), measure)

const start = gulp.series(build, distServer)

const deploy = gulp.series(build, upload)

module.exports = { clean, lint, compile, serve, build, start, deploy }
