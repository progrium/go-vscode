package zipfs

import (
	"archive/zip"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

type FS struct {
	r     *zip.Reader
	files map[string]map[string]*zip.File
}

func splitpath(name string) (dir, file string) {
	name = filepath.ToSlash(name)
	if len(name) == 0 || name[0] != '/' {
		name = "/" + name
	}
	name = filepath.Clean(name)
	dir, file = filepath.Split(name)
	dir = filepath.Clean(dir)
	return
}

func New(r *zip.Reader) fs.FS {
	fs := &FS{r: r, files: make(map[string]map[string]*zip.File)}
	for _, file := range r.File {
		d, f := splitpath(file.Name)
		if _, ok := fs.files[d]; !ok {
			fs.files[d] = make(map[string]*zip.File)
		}
		if _, ok := fs.files[d][f]; !ok {
			fs.files[d][f] = file
		}
		if file.FileInfo().IsDir() {
			dirname := filepath.Join(d, f)
			if _, ok := fs.files[dirname]; !ok {
				fs.files[dirname] = make(map[string]*zip.File)
			}
		}
	}
	return fs
}

func (fs *FS) Create(name string) (fs.File, error) { return nil, errors.ErrUnsupported }

func (fs *FS) Mkdir(name string, perm fs.FileMode) error { return errors.ErrUnsupported }

func (fs *FS) MkdirAll(path string, perm fs.FileMode) error { return errors.ErrUnsupported }

func (fs *FS) Open(name string) (fs.File, error) {
	d, f := splitpath(name)
	if f == "" {
		return &File{fs: fs, isdir: true}, nil
	}
	if _, ok := fs.files[d]; !ok {
		return nil, &os.PathError{Op: "stat", Path: name, Err: syscall.ENOENT}
	}
	file, ok := fs.files[d][f]
	if !ok {
		return nil, &os.PathError{Op: "stat", Path: name, Err: syscall.ENOENT}
	}
	return &File{fs: fs, zipfile: file, isdir: file.FileInfo().IsDir()}, nil
}

func (fs *FS) OpenFile(name string, flag int, perm fs.FileMode) (fs.File, error) {
	if flag != os.O_RDONLY {
		return nil, errors.ErrUnsupported
	}
	return fs.Open(name)
}

func (fs *FS) Remove(name string) error { return errors.ErrUnsupported }

func (fs *FS) RemoveAll(path string) error { return errors.ErrUnsupported }

func (fs *FS) Rename(oldname, newname string) error { return errors.ErrUnsupported }

type pseudoRoot struct{}

func (p *pseudoRoot) Name() string       { return string(filepath.Separator) }
func (p *pseudoRoot) Size() int64        { return 0 }
func (p *pseudoRoot) Mode() os.FileMode  { return os.ModeDir | os.ModePerm }
func (p *pseudoRoot) ModTime() time.Time { return time.Now() }
func (p *pseudoRoot) IsDir() bool        { return true }
func (p *pseudoRoot) Sys() interface{}   { return nil }

func (fs *FS) Stat(name string) (fs.FileInfo, error) {
	d, f := splitpath(name)
	if f == "" {
		return &pseudoRoot{}, nil
	}
	if _, ok := fs.files[d]; !ok {
		return nil, &os.PathError{Op: "stat", Path: name, Err: syscall.ENOENT}
	}
	file, ok := fs.files[d][f]
	if !ok {
		return nil, &os.PathError{Op: "stat", Path: name, Err: syscall.ENOENT}
	}
	return file.FileInfo(), nil
}

func (fs *FS) Name() string { return "zipfs" }

func (fs *FS) Chmod(name string, mode os.FileMode) error { return errors.ErrUnsupported }

func (fs *FS) Chown(name string, uid, gid int) error { return errors.ErrUnsupported }

func (fs *FS) Chtimes(name string, atime time.Time, mtime time.Time) error {
	return errors.ErrUnsupported
}
