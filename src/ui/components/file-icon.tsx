/** @jsxImportSource @gambrel/view */
import { Archive, File as PlainFile, FileCode, FileText, Film, Image as PictureIcon, Music, Package } from '@gambrel/icons'
import type { IconComponent } from '@gambrel/icons'
import type { Child } from '@gambrel/view'
import { fileKindOf } from '../display'
import type { FileKind } from '../display'

const ICONS: Readonly<Record<FileKind, IconComponent>> = {
	archive: Archive,
	video: Film,
	audio: Music,
	image: PictureIcon,
	code: FileCode,
	document: FileText,
	package: Package,
	file: PlainFile
}

export function FileIcon(props: { filename: string }): Child {
	const Icon = ICONS[fileKindOf(props.filename)]
	return (
		<span class="file-icon">
			<Icon size={22} />
		</span>
	)
}
